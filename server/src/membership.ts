import type { Queryable } from './db/index.js';
import { ApiError, forbidden } from './lib/errors.js';
import { STREAM_SELECT, StreamRow } from './streams.js';

export type MembershipRow = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'blocked' | 'left' | 'cancelled';
  stream_id: string;
  requested_at: Date;
  decided_at: Date | null;
  dismissed_at: Date | null;
};

/** Последнее участие, которое ещё что-то значит для экрана: действующее или свежий отказ. */
export async function currentMembership(q: Queryable, userId: string): Promise<MembershipRow | null> {
  const [m] = await q.query<MembershipRow>(
    `select id, status, stream_id, requested_at, decided_at, dismissed_at from memberships
     where user_id = $1 order by requested_at desc limit 1`,
    [userId],
  );
  if (!m) return null;
  if (m.status === 'left' || m.status === 'cancelled') return null;
  if (m.status === 'rejected' && m.dismissed_at) return null;
  return m;
}

export async function loadStream(q: Queryable, streamId: string): Promise<StreamRow> {
  const [s] = await q.query<StreamRow>(`${STREAM_SELECT} where s.id = $1`, [streamId]);
  return s;
}

/** Для записи данных участник должен быть одобрен в потоке. */
export async function requireMember(q: Queryable, userId: string): Promise<{ membership: MembershipRow; stream: StreamRow }> {
  const m = await currentMembership(q, userId);
  if (!m) throw new ApiError(409, 'no_stream', 'Вы не состоите в потоке');
  if (m.status === 'blocked') throw forbidden('Доступ к потоку приостановлен модератором');
  if (m.status !== 'approved') throw new ApiError(409, 'not_approved', 'Заявка ещё не одобрена');
  return { membership: m, stream: await loadStream(q, m.stream_id) };
}
