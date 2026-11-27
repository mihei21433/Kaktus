import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../context.js';
import { joinStream } from './me.js';
import { normalizeCode } from '../lib/crypto.js';
import { badRequest, conflict } from '../lib/errors.js';
import { normalizePhone, normalizeTarget } from '../lib/identity.js';
import { parse, zText } from '../lib/validate.js';

const zChannel = z.enum(['sms', 'email']);

export async function authRoutes(app: FastifyInstance, { auth, db }: Deps) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/request-code', strict, async (req) => {
    const b = parse(z.object({ channel: zChannel, target: z.string().max(254) }), req.body);
    const target = normalizeTarget(b.channel, b.target);
    const res = await auth.requestCode(b.channel, target);
    return { ok: true, target, ...res };
  });

  app.post('/auth/verify', strict, async (req) => {
    const b = parse(z.object({ channel: zChannel, target: z.string().max(254), code: z.string().regex(/^\d{6}$/, '6 цифр') }), req.body);
    const target = normalizeTarget(b.channel, b.target);
    return auth.verifyCode(b.channel, target, b.code);
  });

  // Защита от перебора кодов. Вступление — с запасом: на встрече вся группа может сидеть в одной Wi-Fi сети
  const joinLimit = { config: { rateLimit: { max: 60, timeWindow: '15 minutes' } } };
  const codeLimit = { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } };

  /** Новый участник без SMS: код потока + имя → аккаунт, заявка в поток и личный код входа (показать один раз). */
  app.post('/auth/join', joinLimit, async (req) => {
    const b = parse(
      z.object({
        streamCode: z.string().trim().min(4).max(12),
        firstName: zText(40).optional(),
        lastName: zText(40).optional(),
        phone: z.string().max(30).optional(),
        /** старые версии приложения присылают одно поле */
        name: zText(80).optional(),
        consentVersion: z.string().min(1).max(40),
      }),
      req.body,
    );
    const name = b.firstName !== undefined ? `${b.firstName.trim()} ${b.lastName?.trim() ?? ''}`.trim() : (b.name?.trim() ?? '');
    if (b.firstName !== undefined && (!b.firstName.trim() || !b.lastName?.trim())) throw badRequest('no_name', 'Укажите имя и фамилию');
    if (!name) throw badRequest('no_name', 'Укажите имя');
    if (b.firstName !== undefined && !b.phone) throw badRequest('no_phone', 'Укажите номер телефона');
    const phone = b.phone ? normalizePhone(b.phone) : null;
    return db.tx(async (q) => {
      if (phone) {
        // один человек — одна заявка: тот же номер в этом потоке уже есть
        const [dup] = await q.query(
          `select 1 from memberships m join users u on u.id = m.user_id join streams s on s.id = m.stream_id
           where s.code = $1 and m.status in ('pending', 'approved', 'blocked') and coalesce(u.phone, u.contact_phone) = $2`,
          [normalizeCode(b.streamCode), phone],
        );
        if (dup) throw conflict('phone_taken', 'Участник с этим номером уже есть в потоке. Если это вы — войдите по личному коду или попросите модератора выдать новый');
      }
      const { userId, loginCode } = await auth.createCodeUser(q, { name, consentVersion: b.consentVersion });
      if (phone) await q.query('update users set contact_phone = $2 where id = $1', [userId, phone]);
      const joined = await joinStream(q, userId, b.streamCode);
      return { ...(await auth.issueFor(q, userId)), userId, loginCode, membership: joined.status };
    });
  });

  /** Вход по личному коду входа (новый телефон, после выхода из аккаунта). */
  app.post('/auth/code-login', codeLimit, async (req) => {
    const b = parse(z.object({ code: z.string().max(40) }), req.body);
    return auth.loginWithCode(b.code);
  });

  app.post('/auth/refresh', strict, async (req) => {
    const b = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    return auth.refresh(b.refreshToken);
  });

  app.post('/auth/logout', async (req) => {
    const b = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    await auth.logout(b.refreshToken);
    return { ok: true };
  });
}
