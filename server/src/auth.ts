import { jwtVerify, SignJWT } from 'jose';

import type { Config } from './config.js';
import type { Db, Queryable } from './db/index.js';
import { ApiError, tooMany } from './lib/errors.js';
import { hmac, otpCode, randomToken, safeEqual } from './lib/crypto.js';
import type { Channel } from './lib/identity.js';
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

  async verifyAudioToken(token: string): Promise<{ membershipId: string; date: string }> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'], audience: 'audio' });
      return { membershipId: String(payload.m), date: String(payload.d) };
    } catch {
      throw new ApiError(403, 'link_expired', 'Ссылка на запись устарела');
    }
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
