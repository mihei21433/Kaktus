import type { AuthService } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { Messenger } from './providers/index.js';
import type { FileStore } from './files.js';
import type { Push } from './push.js';

export type Deps = { db: Db; cfg: Config; auth: AuthService; messenger: Messenger; push: Push; files: FileStore };

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}
