/** Доступ модераторов: роль в потоке (владелец или модератор команды). */
import type { Queryable } from './db/index.js';
import { forbidden, notFound } from './lib/errors.js';

export type StreamRole = 'owner' | 'moderator';

export async function requireModerator(q: Queryable, userId: string) {
  const [u] = await q.query<{ is_moderator: boolean }>('select is_moderator from users where id = $1', [userId]);
  if (!u?.is_moderator) throw forbidden('Раздел доступен только модераторам');
}

/** Роль пользователя в потоке; чужой поток — «не найден», чтобы не выдавать его существование. */
export async function streamRole(q: Queryable, userId: string, streamId: string): Promise<StreamRole> {
  const [r] = await q.query<{ role: StreamRole }>('select role from stream_moderators where stream_id = $1 and user_id = $2', [streamId, userId]);
  if (!r) throw notFound('Поток не найден');
  return r.role;
}

export async function requireStreamAccess(q: Queryable, userId: string, streamId: string) {
  await streamRole(q, userId, streamId);
}

/** Настройки, код, нормы, замеры и команда — только у владельца потока. */
export async function requireOwner(q: Queryable, userId: string, streamId: string) {
  if ((await streamRole(q, userId, streamId)) !== 'owner') throw forbidden('Это может только владелец потока');
}
