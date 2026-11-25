import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../context.js';
import type { Queryable } from '../db/index.js';
import { ApiError, conflict, notFound } from '../lib/errors.js';
import { parse, zText } from '../lib/validate.js';
import { currentMembership, loadStream } from '../membership.js';
import { seedMemberGoals, STREAM_SELECT, StreamRow, streamView } from '../streams.js';

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

type UserRow = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string;
  about: string;
  contract: string;
  contract_accepted_at: Date | null;
  profile_completed: boolean;
  consent_version: string | null;
  consent_accepted_at: Date | null;
  ai_transfer: boolean;
  is_moderator: boolean;
};

/** Полное состояние участника в формате мобильного приложения (AppState). */
export async function buildState(q: Queryable, userId: string) {
  const [u] = await q.query<UserRow>('select * from users where id = $1', [userId]);
  const m = await currentMembership(q, userId);
  const stream = m ? await loadStream(q, m.stream_id) : null;

  const state = {
    account: { phone: u.phone, email: u.email, isModerator: u.is_moderator },
    consent: u.consent_version
      ? { version: u.consent_version, acceptedAt: u.consent_accepted_at, aiTransfer: u.ai_transfer }
      : null,
    membership: m && stream
      ? { status: m.status, stream: streamView(stream), requestedAt: m.requested_at, checks: 0 }
      : { status: 'none', checks: 0 },
    profile: {
      name: u.name,
      about: u.about,
      contract: u.contract,
      contractAcceptedAt: u.contract_accepted_at ?? undefined,
      completed: u.profile_completed,
    },
    goals: [] as unknown[],
    interim: [] as unknown[],
    tasks: [] as unknown[],
    statements: {} as Record<string, unknown>,
    steps: {} as Record<string, number>,
    fitness: {} as Record<string, Record<string, number>>,
    reminders: { morning: '09:00', evening: '21:00' },
  };
  if (!m || m.status !== 'approved') return state;

  const mid = m.id;
  state.goals = (
    await q.query<{ id: string; title: string; color: string; hint: string; result: string; criteria: unknown; custom: boolean; split_weekly: boolean }>(
      'select * from goals where membership_id = $1 order by position, title',
      [mid],
    )
  ).map((g) => ({ id: g.id, title: g.title, color: g.color, hint: g.hint, result: g.result, criteria: g.criteria, custom: g.custom, splitWeekly: g.split_weekly }));

  state.interim = (
    await q.query<{ id: string; goal_id: string; horizon: string; text: string; target: unknown; unit: string | null; progress: unknown; start_date: string }>(
      'select id, goal_id, horizon, text, target, unit, progress, start_date::text as start_date from interim_goals where membership_id = $1 order by start_date',
      [mid],
    )
  ).map((i) => ({ id: i.id, goalId: i.goal_id, horizon: i.horizon, text: i.text, target: num(i.target), unit: i.unit ?? undefined, progress: Number(i.progress), startDate: i.start_date }));

  const tasks = await q.query<{ id: string; goal_id: string; text: string; date: string; repeat_daily: boolean; min_value: unknown; unit: string | null; from_moderator: boolean }>(
    `select id, goal_id, text, date::text as date, repeat_daily, min_value, unit, from_moderator
     from tasks where membership_id = $1 and deleted_at is null order by created_at`,
    [mid],
  );
  const comps = await q.query<{ task_id: string; date: string; done: boolean }>(
    `select c.task_id, c.date::text as date, c.done from task_completions c
     join tasks t on t.id = c.task_id where t.membership_id = $1 and t.deleted_at is null`,
    [mid],
  );
  const byTask = new Map<string, Record<string, boolean>>();
  for (const c of comps) {
    if (!byTask.has(c.task_id)) byTask.set(c.task_id, {});
    if (c.done) byTask.get(c.task_id)![c.date] = true;
  }
  state.tasks = tasks.map((t) => ({
    id: t.id,
    goalId: t.goal_id,
    text: t.text,
    date: t.date,
    repeatDaily: t.repeat_daily,
    minValue: num(t.min_value),
    unit: t.unit ?? undefined,
    fromModerator: t.from_moderator,
    completions: byTask.get(t.id) ?? {},
  }));

  for (const s of await q.query<{ date: string; text: string; kind: string; sent_at: Date }>(
    'select date::text as date, text, kind, sent_at from statements where membership_id = $1',
    [mid],
  )) {
    state.statements[s.date] = { text: s.text, kind: s.kind, sentAt: s.sent_at };
  }
  for (const s of await q.query<{ date: string; count: number }>('select date::text as date, count from steps where membership_id = $1', [mid])) {
    state.steps[s.date] = s.count;
  }
  for (const f of await q.query<{ date: string; norm_id: string; value: unknown }>(
    'select date::text as date, norm_id, value from fitness where membership_id = $1',
    [mid],
  )) {
    (state.fitness[f.date] ??= {})[f.norm_id] = Number(f.value);
  }
  return state;
}

export async function meRoutes(app: FastifyInstance, { db }: Deps) {
  app.get('/me/state', async (req) => buildState(db, req.userId));

  /* --- Согласие --- */
  app.post('/me/consent', async (req) => {
    const b = parse(z.object({ version: z.string().min(1).max(40) }), req.body);
    await db.query('update users set consent_version = $2, consent_accepted_at = now() where id = $1', [req.userId, b.version]);
    return { ok: true };
  });
  app.put('/me/consent', async (req) => {
    const b = parse(z.object({ aiTransfer: z.boolean() }), req.body);
    const [u] = await db.query('update users set ai_transfer = $2 where id = $1 and consent_version is not null returning id', [req.userId, b.aiTransfer]);
    if (!u) throw conflict('no_consent', 'Сначала примите согласие');
    return { ok: true };
  });

  /* --- Профиль --- */
  app.put('/me/profile', async (req) => {
    const b = parse(
      z.object({ name: zText(60).optional(), about: zText(300), contract: zText(1000), accepted: z.boolean() }),
      req.body,
    );
    await db.query(
      `update users set
         name = coalesce(nullif($2, ''), name), about = $3,
         contract = case when contract_accepted_at is null then $4 else contract end,
         contract_accepted_at = case when $5 then coalesce(contract_accepted_at, now()) else contract_accepted_at end,
         profile_completed = true
       where id = $1`,
      [req.userId, b.name ?? '', b.about, b.contract, b.accepted],
    );
    return { ok: true };
  });
  app.post('/me/profile/skip', async (req) => {
    await db.query('update users set profile_completed = true where id = $1', [req.userId]);
    return { ok: true };
  });

  /* --- Поток --- */
  app.post('/me/join', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(z.object({ code: z.string().trim().min(4).max(12) }), req.body);
    return db.tx(async (q) => {
      const [u] = await q.query<{ consent_version: string | null }>('select consent_version from users where id = $1', [req.userId]);
      if (!u.consent_version) throw conflict('no_consent', 'Сначала примите согласие на обработку данных');
      const cur = await currentMembership(q, req.userId);
      if (cur && ['pending', 'approved', 'blocked'].includes(cur.status)) {
        throw conflict('already_member', 'Вы уже подали заявку или состоите в потоке');
      }
      const [s] = await q.query<StreamRow & { require_approval: boolean }>(`${STREAM_SELECT} where s.code = $1`, [b.code.toUpperCase()]);
      if (!s) throw notFound('Такого кода нет. Проверьте буквы или спросите код у модератора');
      const status = s.require_approval ? 'pending' : 'approved';
      const [m] = await q.query<{ id: string }>(
        `insert into memberships (stream_id, user_id, status, decided_at) values ($1, $2, $3, case when $3 = 'approved' then now() end) returning id`,
        [s.id, req.userId, status],
      );
      if (status === 'approved') await seedMemberGoals(q, m.id, s.id);
      return { status, stream: streamView(s) };
    });
  });

  app.get('/me/membership', async (req) => {
    const m = await currentMembership(db, req.userId);
    if (!m) return { status: 'none' };
    return { status: m.status, stream: streamView(await loadStream(db, m.stream_id)) };
  });

  /** «Ввести другой код»: отзыв заявки или скрытие отказа. */
  app.post('/me/join/cancel', async (req) => {
    const m = await currentMembership(db, req.userId);
    if (m?.status === 'pending') await db.query(`update memberships set status = 'cancelled' where id = $1`, [m.id]);
    else if (m?.status === 'rejected') await db.query('update memberships set dismissed_at = now() where id = $1', [m.id]);
    else throw conflict('nothing_to_cancel', 'Нет заявки, которую можно отозвать');
    return { ok: true };
  });

  app.post('/me/leave', async (req) => {
    const m = await currentMembership(db, req.userId);
    if (!m || !['approved', 'blocked'].includes(m.status)) throw conflict('no_stream', 'Вы не состоите в потоке');
    await db.query(`update memberships set status = 'left', decided_at = now() where id = $1`, [m.id]);
    return { ok: true };
  });

  app.delete('/me', async (req) => {
    const [owns] = await db.query('select 1 from streams where owner_id = $1 limit 1', [req.userId]);
    if (owns) throw new ApiError(409, 'owns_streams', 'Сначала передайте свои потоки другому модератору');
    await db.query('delete from users where id = $1', [req.userId]);
    return { ok: true };
  });

  app.post('/me/push-token', async (req) => {
    const b = parse(z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web']) }), req.body);
    await db.query(
      `insert into push_tokens (token, user_id, platform) values ($1, $2, $3)
       on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform`,
      [b.token, req.userId, b.platform],
    );
    return { ok: true };
  });

}
