import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../context.js';
import { joinStream } from './me.js';
import { normalizeTarget } from '../lib/identity.js';
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
      z.object({ streamCode: z.string().trim().min(4).max(12), name: zText(80).min(1), consentVersion: z.string().min(1).max(40) }),
      req.body,
    );
    return db.tx(async (q) => {
      const { userId, loginCode } = await auth.createCodeUser(q, { name: b.name.trim(), consentVersion: b.consentVersion });
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
