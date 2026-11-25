/** API модератора: потоки, заявки, участники. Экраны модератора — этап 4. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../context.js';
import type { Queryable } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { todayIn } from '../lib/time.js';
import { parse, zDate, zId, zText } from '../lib/validate.js';
import { streamCode as newStreamCode } from '../lib/crypto.js';
import { memberStats, MemberLabel } from '../stats.js';
import { createStream, seedMemberGoals, STREAM_SELECT, StreamRow, streamView } from '../streams.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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

export async function moderatorRoutes(app: FastifyInstance, { db, push, files, auth }: Deps) {
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

  /* ---------- Этап 4: кабинет модератора ---------- */

  const modStreams = (userId: string) =>
    db.query<StreamRow & { require_approval: boolean; created_at: Date }>(
      `${STREAM_SELECT.replace('from streams s', ', s.created_at from streams s')}
       join stream_moderators sm on sm.stream_id = s.id and sm.user_id = $1
       order by s.created_at desc`,
      [userId],
    );

  async function streamMembers(streamId: string) {
    return db.query<{ id: string; status: string; decided_at: Date | null; requested_at: Date; name: string; phone: string | null; email: string | null }>(
      `select m.id, m.status, m.decided_at, m.requested_at, u.name, u.phone, u.email
       from memberships m join users u on u.id = m.user_id
       where m.stream_id = $1 and m.status in ('approved', 'blocked') order by u.name, m.requested_at`,
      [streamId],
    );
  }

  const displayName = (r: { name: string; phone: string | null; email: string | null }) => r.name || r.phone || r.email || 'Участник';

  app.get('/mod/overview', async (req) => {
    await requireModerator(db, req.userId);
    const streams = await modStreams(req.userId);
    const out = [];
    let totalMembers = 0;
    let attention = 0;
    for (const s of streams) {
      const members = await streamMembers(s.id);
      const stats = await memberStats(db, members.filter((m) => m.status === 'approved'), s);
      const counts: Record<MemberLabel, number> = { on_plan: 0, behind: 0, no_reports: 0, new: 0 };
      for (const st of stats.values()) counts[st.label]++;
      const [{ pending }] = await db.query<{ pending: number }>(
        `select count(*)::int as pending from memberships where stream_id = $1 and status = 'pending'`,
        [s.id],
      );
      totalMembers += members.length;
      attention += counts.behind + counts.no_reports;
      out.push({ ...streamView(s), requireApproval: s.require_approval, members: members.length, pending, counts });
    }
    return { streams: out, totals: { members: totalMembers, attention } };
  });

  app.get('/mod/requests', async (req) => {
    await requireModerator(db, req.userId);
    const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending') }), req.query);
    const rows = await db.query<{ id: string; status: string; requested_at: Date; decided_at: Date | null; name: string; phone: string | null; email: string | null; stream_name: string; stream_code: string }>(
      `select m.id, m.status, m.requested_at, m.decided_at, u.name, u.phone, u.email, s.name as stream_name, s.code as stream_code
       from memberships m join users u on u.id = m.user_id join streams s on s.id = m.stream_id
       join stream_moderators sm on sm.stream_id = s.id and sm.user_id = $1
       where m.status = $2 order by coalesce(m.decided_at, m.requested_at) desc limit 200`,
      [req.userId, status],
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      name: displayName(r),
      contact: r.phone ?? r.email,
      streamName: r.stream_name,
      streamCode: r.stream_code,
      requestedAt: r.requested_at,
      decidedAt: r.decided_at,
    }));
  });

  app.get('/mod/streams/:id', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireStreamAccess(db, req.userId, id);
    const [s] = await db.query<StreamRow & { require_approval: boolean }>(`${STREAM_SELECT} where s.id = $1`, [id]);
    return { ...streamView(s), requireApproval: s.require_approval };
  });

  app.get('/mod/streams/:id/members', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireStreamAccess(db, req.userId, id);
    const [s] = await db.query<StreamRow>(`${STREAM_SELECT} where s.id = $1`, [id]);
    const members = await streamMembers(id);
    const stats = await memberStats(db, members, s);
    return members.map((m) => {
      const st = stats.get(m.id)!;
      return {
        id: m.id,
        name: displayName(m),
        blocked: m.status === 'blocked',
        label: st.label,
        today: st.today,
        taskRate: st.taskRate,
        lastActivity: st.lastActivity,
        stepsBelow: st.stepsBelow,
      };
    });
  });

  async function memberAccess(userId: string, membershipId: string) {
    const [m] = await db.query<{ id: string; stream_id: string; status: string; decided_at: Date | null; requested_at: Date; user_id: string }>(
      'select id, stream_id, status, decided_at, requested_at, user_id from memberships where id = $1',
      [membershipId],
    );
    if (!m) throw notFound('Участник не найден');
    await requireStreamAccess(db, userId, m.stream_id);
    const [s] = await db.query<StreamRow>(`${STREAM_SELECT} where s.id = $1`, [m.stream_id]);
    return { m, s };
  }

  app.get('/mod/members/:id', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    const { m, s } = await memberAccess(req.userId, id);
    const [u] = await db.query<{ name: string; phone: string | null; email: string | null; about: string; contract: string }>(
      'select name, phone, email, about, contract from users where id = $1',
      [m.user_id],
    );
    const st = (await memberStats(db, [m], s)).get(m.id)!;
    const goals = await db.query<{ id: string; title: string; color: string; result: string; criteria: { done: boolean }[]; custom: boolean }>(
      'select id, title, color, result, criteria, custom from goals where membership_id = $1 order by position, title',
      [m.id],
    );
    const interim = await db.query<{ id: string; goal_id: string; horizon: string; text: string; target: unknown; unit: string | null; progress: unknown }>(
      'select id, goal_id, horizon, text, target, unit, progress from interim_goals where membership_id = $1 order by start_date',
      [m.id],
    );
    return {
      member: {
        id: m.id,
        name: displayName(u),
        contact: u.phone ?? u.email,
        about: u.about,
        contract: u.contract,
        blocked: m.status === 'blocked',
        status: m.status,
      },
      stream: { id: s.id, name: s.name, stepsThreshold: s.steps_threshold, modules: s.modules },
      stats: { ...st, days: undefined },
      days: st.days,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        color: g.color,
        result: g.result,
        custom: g.custom,
        progress: g.criteria.length ? g.criteria.filter((c) => c.done).length / g.criteria.length : 0,
      })),
      interim: interim.map((i) => ({
        id: i.id,
        goalId: i.goal_id,
        horizon: i.horizon,
        text: i.text,
        target: i.target === null ? null : Number(i.target),
        unit: i.unit,
        progress: Number(i.progress),
      })),
    };
  });

  app.get('/mod/members/:id/statements/:date/audio-link', async (req) => {
    await requireModerator(db, req.userId);
    const p = parse(z.object({ id: zId, date: zDate }), req.params);
    const { m } = await memberAccess(req.userId, p.id);
    const [s] = await db.query<{ audio_path: string | null }>('select audio_path from statements where membership_id = $1 and date = $2', [m.id, p.date]);
    if (!s?.audio_path) throw notFound('Записи нет');
    return { url: `/v1/audio/${await auth.audioToken(m.id, p.date)}` };
  });

  app.get('/mod/members/:id/statements/:date/audio', async (req, reply) => {
    await requireModerator(db, req.userId);
    const p = parse(z.object({ id: zId, date: zDate }), req.params);
    const { m } = await memberAccess(req.userId, p.id);
    const [s] = await db.query<{ audio_path: string | null }>('select audio_path from statements where membership_id = $1 and date = $2', [m.id, p.date]);
    if (!s?.audio_path || !(await files.exists(s.audio_path))) throw notFound('Записи нет');
    const f = files.open(s.audio_path);
    return reply.header('Content-Type', f.type).header('Cache-Control', 'private, no-store').send(f.stream);
  });

  app.post('/mod/members/:id/tasks', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    const b = parse(
      z.object({
        id: zId,
        goalId: zId,
        text: zText(300).min(1),
        date: zDate,
        comment: zText(500).optional(),
        notify: z.boolean().default(true),
      }),
      req.body,
    );
    const { m, s } = await memberAccess(req.userId, id);
    if (m.status !== 'approved') throw conflict('not_active', 'Участник сейчас не активен в потоке');
    const today = todayIn(s.timezone);
    if (b.date < today) throw badRequest('bad_date', 'Нельзя поставить задачу на прошедший день');
    const [g] = await db.query('select 1 from goals where id = $1 and membership_id = $2', [b.goalId, m.id]);
    if (!g) throw notFound('Цель не найдена');
    await db.query(
      `insert into tasks (id, membership_id, goal_id, text, date, from_moderator, comment)
       values ($1, $2, $3, $4, $5, true, $6) on conflict (id) do nothing`,
      [b.id, m.id, b.goalId, b.text, b.date, b.comment || null],
    );
    if (b.notify) {
      // Текст задачи в уведомление не кладём: пуш идёт через внешние сервисы, а задача может касаться здоровья
      await push.notifyUser(m.user_id, 'Модератор добавил задачу', 'Откройте приложение, чтобы посмотреть', { type: 'task', taskId: b.id });
    }
    return { ok: true };
  });

  app.get('/mod/streams/:id/broadcasts', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireStreamAccess(db, req.userId, id);
    return db.query(
      'select id, text, recipients, created_at as "createdAt" from broadcasts where stream_id = $1 order by created_at desc limit 50',
      [id],
    );
  });

  app.post('/mod/streams/:id/broadcasts', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    const b = parse(z.object({ text: zText(1000).min(1) }), req.body);
    await requireStreamAccess(db, req.userId, id);
    const [s] = await db.query<{ name: string }>('select name from streams where id = $1', [id]);
    const users = await db.query<{ user_id: string }>(`select user_id from memberships where stream_id = $1 and status = 'approved'`, [id]);
    await db.query('insert into broadcasts (stream_id, author_id, text, recipients) values ($1, $2, $3, $4)', [id, req.userId, b.text, users.length]);
    for (const u of users) await push.notifyUser(u.user_id, s.name, b.text, { type: 'broadcast' });
    return { ok: true, recipients: users.length };
  });

  app.patch('/mod/streams/:id', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    const b = parse(
      z.object({
        name: zText(80).min(1).optional(),
        requireApproval: z.boolean().optional(),
        stepsThreshold: z.number().int().min(0).max(100_000).optional(),
        modules: z.object({ statements: z.boolean(), steps: z.boolean(), analyses: z.boolean(), goals: z.boolean(), ai: z.boolean() }).partial().optional(),
        reminders: z
          .object({ enabled: z.boolean(), morning: z.string().regex(HHMM, 'время ЧЧ:ММ'), evening: z.string().regex(HHMM, 'время ЧЧ:ММ') })
          .partial()
          .optional(),
      }),
      req.body,
    );
    await requireStreamAccess(db, req.userId, id);
    await db.query(
      `update streams set
         name = coalesce($2, name),
         require_approval = coalesce($3, require_approval),
         steps_threshold = coalesce($4, steps_threshold),
         modules = modules || coalesce($5::jsonb, '{}'::jsonb),
         reminders = reminders || coalesce($6::jsonb, '{}'::jsonb)
       where id = $1`,
      [
        id,
        b.name ?? null,
        b.requireApproval ?? null,
        b.stepsThreshold ?? null,
        b.modules ? JSON.stringify(b.modules) : null,
        b.reminders ? JSON.stringify(b.reminders) : null,
      ],
    );
    const [s] = await db.query<StreamRow & { require_approval: boolean }>(`${STREAM_SELECT} where s.id = $1`, [id]);
    return { ...streamView(s), requireApproval: s.require_approval };
  });

  app.post('/mod/streams/:id/new-code', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireStreamAccess(db, req.userId, id);
    for (let i = 0; i < 5; i++) {
      try {
        const [r] = await db.query<{ code: string }>('update streams set code = $2 where id = $1 returning code', [id, newStreamCode()]);
        return { code: r.code };
      } catch (e) {
        if (!String((e as Error).message).includes('streams_code_key')) throw e;
      }
    }
    throw new Error('Не удалось создать новый код');
  });
}
