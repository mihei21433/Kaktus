import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from './auth.js';
import type { Config } from './config.js';
import type { Deps } from './context.js';
import type { Db } from './db/index.js';
import { ApiError } from './lib/errors.js';
import { createMessenger, Messenger } from './providers/index.js';
import { createPush, Push } from './push.js';
import { authRoutes } from './routes/auth.js';
import { dataRoutes } from './routes/data.js';
import { meRoutes } from './routes/me.js';
import { moderatorRoutes } from './routes/moderator.js';

export async function buildApp(db: Db, cfg: Config, opts: { logger?: boolean; messenger?: Messenger; push?: Push } = {}) {
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });
  const messenger = opts.messenger ?? createMessenger(cfg, app.log);
  const deps: Deps = {
    db,
    cfg,
    messenger,
    auth: new AuthService(db, cfg, messenger),
    push: opts.push ?? createPush(db, cfg, app.log),
  };

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.decorateRequest('userId', '');

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: err.code, message: err.message });
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: 'too_many_requests', message: 'Слишком много запросов' });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: 'bad_request', message: e.message });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Ошибка сервера. Попробуйте ещё раз чуть позже' });
  });

  const authenticate = async (req: FastifyRequest, _reply: FastifyReply) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new ApiError(401, 'unauthorized', 'Нужно войти');
    req.userId = await deps.auth.verifyAccess(h.slice(7));
    const [u] = await db.query('select 1 from users where id = $1', [req.userId]);
    if (!u) throw new ApiError(401, 'unauthorized', 'Аккаунт не найден');
  };

  app.get('/health', async () => ({ ok: true }));

  await app.register(
    async (v1) => {
      await v1.register((r) => authRoutes(r, deps));
      await v1.register(async (r) => {
        r.addHook('preHandler', authenticate);
        await meRoutes(r, deps);
        await dataRoutes(r, deps);
        await moderatorRoutes(r, deps);
      });
    },
    { prefix: '/v1' },
  );

  return app;
}
