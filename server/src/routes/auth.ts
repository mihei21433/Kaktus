import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../context.js';
import { normalizeTarget } from '../lib/identity.js';
import { parse } from '../lib/validate.js';

const zChannel = z.enum(['sms', 'email']);

export async function authRoutes(app: FastifyInstance, { auth }: Deps) {
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
