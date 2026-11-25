/** API модератора: потоки, заявки, участники. Экраны модератора — этап 4. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../context.js';
import type { Queryable } from '../db/index.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { todayIn } from '../lib/time.js';
import { parse, zDate, zId, zText } from '../lib/validate.js';
import { createStream, seedMemberGoals, STREAM_SELECT, StreamRow, streamView } from '../streams.js';

async function requireModerator(q: Queryable, userId: string) {
  const [u] = await q.query<{ is_moderator: boolean }>('select is_moderator from users where id = $1', [userId]);
  if (!u?.is_moderator) throw forbidden('Раздел доступен только модераторам');
}

async function requireStreamAccess(q: Queryable, userId: string, streamId: string) {
  const [r] = await q.query('select 1 from stream_moderators where stream_id = $1 and user_id = $2', [streamId, userId]);
  if (!r) throw notFound('Поток не найден');
}

type Decision = 'approve' | 'reject' | 'block' | 'unblock';
const TRANSITIONS: Record<Decision, { from: string[]; to: string }> = {
  approve: { from: ['pending'], to: 'approved' },
  reject: { from: ['pending'], to: 'rejected' },
  block: { from: ['approved'], to: 'blocked' },
  unblock: { from: ['blocked'], to: 'approved' },
};

/** Общая логика решения по участию — используется и API, и командой admin. */
export async function decideMembership(q: Queryable, membershipId: string, decision: Decision, byUserId: string | null) {
  const [m] = await q.query<{ id: string; status: string; stream_id: string; user_id: string }>(
    'select id, status, stream_id, user_id from memberships where id = $1 for update',
    [membershipId],
  );
  if (!m) throw notFound('Заявка не найдена');
  const t = TRANSITIONS[decision];
  if (!t.from.includes(m.status)) throw conflict('bad_status', `Нельзя: текущий статус «${m.status}»`);
  await q.query('update memberships set status = $2, decided_at = now(), decided_by = $3 where id = $1', [m.id, t.to, byUserId]);
  if (decision === 'approve') await seedMemberGoals(q, m.id, m.stream_id);
  return { userId: m.user_id, streamId: m.stream_id, status: t.to };
}

const PUSH_TEXT: Partial<Record<Decision, [string, string]>> = {
  approve: ['Заявка одобрена', 'Добро пожаловать в поток! Откройте приложение, чтобы начать.'],
  reject: ['Заявка отклонена', 'Модератор отклонил заявку. Откройте приложение, чтобы ввести другой код.'],
};

export async function moderatorRoutes(app: FastifyInstance, { db, push }: Deps) {
  app.post('/mod/streams', async (req) => {
    await requireModerator(db, req.userId);
    const b = parse(
      z.object({
        name: zText(80).min(1),
        durationDays: z.number().int().min(1).max(365).default(90),
        requireApproval: z.boolean().default(true),
        startDate: zDate.optional(),
      }),
      req.body,
    );
    const s = await db.tx((q) =>
      createStream(q, {
        name: b.name,
        ownerId: req.userId,
        startDate: b.startDate ?? todayIn('Asia/Almaty'),
        durationDays: b.durationDays,
        requireApproval: b.requireApproval,
      }),
    );
    const [row] = await db.query<StreamRow>(`${STREAM_SELECT} where s.id = $1`, [s.id]);
    return streamView(row);
  });

  app.get('/mod/streams', async (req) => {
    await requireModerator(db, req.userId);
    const rows = await db.query<StreamRow & { members: number; pending: number }>(
      `${STREAM_SELECT.replace('from streams s', `, (select count(*)::int from memberships m where m.stream_id = s.id and m.status in ('approved','blocked')) as members,
         (select count(*)::int from memberships m where m.stream_id = s.id and m.status = 'pending') as pending
       from streams s`)}
       join stream_moderators sm on sm.stream_id = s.id and sm.user_id = $1
       order by s.created_at desc`,
      [req.userId],
    );
    return rows.map((r) => ({ ...streamView(r), members: r.members, pending: r.pending }));
  });

  app.get('/mod/streams/:id/memberships', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'rejected', 'blocked']).optional() }), req.query);
    await requireStreamAccess(db, req.userId, id);
    return db.query(
      `select m.id, m.status, m.requested_at as "requestedAt", m.decided_at as "decidedAt",
              u.name, u.phone, u.email
       from memberships m join users u on u.id = m.user_id
       where m.stream_id = $1 and ($2::text is null or m.status = $2)
       order by m.requested_at desc`,
      [id, status ?? null],
    );
  });

  app.post('/mod/memberships/:id/:decision', async (req) => {
    await requireModerator(db, req.userId);
    const p = parse(z.object({ id: zId, decision: z.enum(['approve', 'reject', 'block', 'unblock']) }), req.params);
    const res = await db.tx(async (q) => {
      const [m] = await q.query<{ stream_id: string }>('select stream_id from memberships where id = $1', [p.id]);
      if (!m) throw notFound('Заявка не найдена');
      await requireStreamAccess(q, req.userId, m.stream_id);
      return decideMembership(q, p.id, p.decision, req.userId);
    });
    const text = PUSH_TEXT[p.decision];
    if (text) await push.notifyUser(res.userId, text[0], text[1], { type: 'membership', status: res.status });
    return { ok: true, status: res.status };
  });
}
