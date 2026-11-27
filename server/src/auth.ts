import { jwtVerify, SignJWT } from 'jose';

import type { Config } from './config.js';
import type { Db, Queryable } from './db/index.js';
import { ApiError, badRequest, tooMany } from './lib/errors.js';
import { hmac, loginCode, normalizeCode, otpCode, randomToken, safeEqual } from './lib/crypto.js';
import type { Channel } from './lib/identity.js';
import { fullName, splitName } from './people.js';
import type { Messenger } from './providers/index.js';

export type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };

export class AuthService {
  private key: Uint8Array;
  constructor(
    private db: Db,
    private cfg: Config,
    private messenger: Messenger,
  ) {
    this.key = new TextEncoder().encode(cfg.jwtSecret);
  }

  /** Отправляет код. Не чаще раза в минуту и не больше 5 раз в час на один номер/адрес. */
  async requestCode(channel: Channel, target: string): Promise<{ devCode?: string }> {
    const [recent] = await this.db.query<{ last: Date | null; n: number }>(
      `select max(created_at) as last, count(*)::int as n from otp_codes
       where target = $1 and created_at > now() - interval '1 hour'`,
      [target],
    );
    if (recent.last && Date.now() - new Date(recent.last).getTime() < 60_000) {
      throw tooMany('Код уже отправлен. Запросить новый можно через минуту');
    }
    if (recent.n >= 5) throw tooMany('Слишком много попыток. Попробуйте через час');

    const code = otpCode();
    await this.db.query(
      `insert into otp_codes (channel, target, code_hash, expires_at)
       values ($1, $2, $3, now() + make_interval(mins => $4))`,
      [channel, target, hmac(this.cfg.jwtSecret, `${target}:${code}`), this.cfg.otpTtlMin],
    );
    const text = `Кактус: код входа ${code}. Никому его не сообщайте.`;
    if (channel === 'sms') await this.messenger.sendSms(target, text);
    else await this.messenger.sendEmail(target, `Код входа в Кактус: ${code}`, text);
    return this.cfg.devReturnCodes ? { devCode: code } : {};
  }

  /** Проверяет код и выдаёт токены; создаёт пользователя при первом входе. */
  async verifyCode(channel: Channel, target: string, code: string): Promise<Tokens & { userId: string; isNew: boolean }> {
    return this.db.tx(async (q) => {
      const [otp] = await q.query<{ id: string; code_hash: string; attempts: number }>(
        `select id, code_hash, attempts from otp_codes
         where target = $1 and consumed_at is null and expires_at > now()
         order by created_at desc limit 1 for update`,
        [target],
      );
      if (!otp) throw new ApiError(400, 'code_expired', 'Код устарел. Запросите новый');
      if (otp.attempts >= this.cfg.otpMaxAttempts) {
        throw new ApiError(400, 'code_attempts', 'Слишком много неверных попыток. Запросите новый код');
      }
      if (!safeEqual(otp.code_hash, hmac(this.cfg.jwtSecret, `${target}:${code}`))) {
        await q.query('update otp_codes set attempts = attempts + 1 where id = $1', [otp.id]);
        throw new ApiError(400, 'code_wrong', 'Неверный код');
      }
      await q.query('update otp_codes set consumed_at = now() where id = $1', [otp.id]);

      const col = channel === 'sms' ? 'phone' : 'email';
      let [user] = await q.query<{ id: string }>(`select id from users where ${col} = $1`, [target]);
      const isNew = !user;
      if (!user) [user] = await q.query<{ id: string }>(`insert into users (${col}) values ($1) returning id`, [target]);
      return { ...(await this.issue(q, user.id)), userId: user.id, isNew };
    });
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    return this.db.tx(async (q) => {
      const hash = hmac(this.cfg.jwtSecret, refreshToken);
      const [row] = await q.query<{ id: string; user_id: string }>(
        `update refresh_tokens set revoked_at = now()
         where token_hash = $1 and revoked_at is null and expires_at > now()
         returning id, user_id`,
        [hash],
      );
      if (!row) throw new ApiError(401, 'session_expired', 'Сессия устарела. Войдите заново');
      return this.issue(q, row.user_id);
    });
  }

  async logout(refreshToken: string) {
    await this.db.query('update refresh_tokens set revoked_at = now() where token_hash = $1', [hmac(this.cfg.jwtSecret, refreshToken)]);
  }

  async verifyAccess(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string') throw new Error('no sub');
      return payload.sub;
    } catch {
      throw new ApiError(401, 'unauthorized', 'Нужно войти заново');
    }
  }

  /** Подписанная ссылка на аудио: действует 10 минут, открывается без заголовка авторизации (нужно плееру). */
  async audioToken(membershipId: string, date: string): Promise<string> {
    return new SignJWT({ m: membershipId, d: date })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('audio')
      .setExpirationTime('10m')
      .sign(this.key);
  }

  /** Подписанная ссылка на бланк анализов (10 минут). */
  async blankToken(blankId: string): Promise<string> {
    return new SignJWT({ b: blankId }).setProtectedHeader({ alg: 'HS256' }).setAudience('blank').setExpirationTime('10m').sign(this.key);
  }

  async verifyBlankToken(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'], audience: 'blank' });
      return String(payload.b);
    } catch {
      throw new ApiError(403, 'link_expired', 'Ссылка на бланк устарела');
    }
  }

  async verifyAudioToken(token: string): Promise<{ membershipId: string; date: string }> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'], audience: 'audio' });
      return { membershipId: String(payload.m), date: String(payload.d) };
    } catch {
      throw new ApiError(403, 'link_expired', 'Ссылка на запись устарела');
    }
  }

  private loginHash(code: string) {
    return hmac(this.cfg.jwtSecret, `login:${normalizeCode(code)}`);
  }

  /** Новый личный код входа. Старый перестаёт работать; с revoke — выходят и все устройства. */
  async setLoginCode(q: Queryable, userId: string, opts: { revokeSessions?: boolean } = {}): Promise<string> {
    for (let i = 0; ; i++) {
      const code = loginCode();
      try {
        await q.query('update users set login_code_hash = $2, login_code_set_at = now() where id = $1', [userId, this.loginHash(code)]);
        if (opts.revokeSessions) await q.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
        return code;
      } catch (e) {
        if (i < 3 && String((e as Error).message).includes('login_code_hash')) continue;
        throw e;
      }
    }
  }

  /** Вход по личному коду. */
  async loginWithCode(code: string): Promise<Tokens & { userId: string }> {
    const norm = normalizeCode(code);
    if (norm.length !== 10) throw badRequest('bad_code', 'Код входа — 10 знаков, например K7F3Q-9QX2M');
    return this.db.tx(async (q) => {
      const [u] = await q.query<{ id: string }>('select id from users where login_code_hash = $1', [this.loginHash(norm)]);
      if (!u) throw new ApiError(401, 'wrong_code', 'Такого кода входа нет. Проверьте его или попросите у модератора новый');
      return { ...(await this.issue(q, u.id)), userId: u.id };
    });
  }

  /** Новый пользователь без телефона и почты: вход только по личному коду. */
  async createCodeUser(
    q: Queryable,
    fields: { name: string; firstName?: string; lastName?: string; consentVersion?: string; isModerator?: boolean },
  ): Promise<{ userId: string; loginCode: string }> {
    const n = fields.firstName !== undefined ? { first: fields.firstName.trim(), last: fields.lastName?.trim() ?? '' } : splitName(fields.name);
    const [u] = await q.query<{ id: string }>(
      `insert into users (name, first_name, last_name, consent_version, consent_accepted_at, is_moderator)
       values ($1, $2, $3, $4, case when $4::text is null then null else now() end, $5) returning id`,
      [fullName(n.first, n.last), n.first, n.last, fields.consentVersion ?? null, !!fields.isModerator],
    );
    return { userId: u.id, loginCode: await this.setLoginCode(q, u.id) };
  }

  async issueFor(q: Queryable, userId: string): Promise<Tokens> {
    return this.issue(q, userId);
  }

  private async issue(q: Queryable, userId: string): Promise<Tokens> {
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${this.cfg.accessTtlSec}s`)
      .sign(this.key);
    const refreshToken = randomToken();
    await q.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at)
       values ($1, $2, now() + make_interval(days => $3))`,
      [userId, hmac(this.cfg.jwtSecret, refreshToken), this.cfg.refreshTtlDays],
    );
    return { accessToken, refreshToken, expiresIn: this.cfg.accessTtlSec };
  }
}
