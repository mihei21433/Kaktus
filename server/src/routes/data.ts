/** Ежедневные данные участника. Идентификаторы новых записей присылает приложение (UUID) — повтор запроса безопасен. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../context.js';
import type { Queryable } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { addDays, todayIn } from '../lib/time.js';
import { parse, zDate, zId, zText } from '../lib/validate.js';
import { requireMember } from '../membership.js';

const zCriteria = z.array(z.object({ id: z.string().min(1).max(40), text: zText(200).min(1), done: z.boolean() })).max(20);

/** Проверка даты: не раньше `back` дней назад и не позже `ahead` дней вперёд по времени потока. */
function checkDate(date: string, tz: string, back: number, ahead: number) {
  const today = todayIn(tz);
  if (date < addDays(today, -back) || date > addDays(today, ahead)) {
    throw badRequest('bad_date', 'Эту дату сейчас изменить нельзя');
  }
}

async function ownGoal(q: Queryable, membershipId: string, goalId: string) {
  const [g] = await q.query<{ id: string; custom: boolean }>('select id, custom from goals where id = $1 and membership_id = $2', [goalId, membershipId]);
  if (!g) throw notFound('Цель не найдена');
  return g;
}

export async function dataRoutes(app: FastifyInstance, { db }: Deps) {
  /* --- Задачи --- */
  app.post('/me/tasks', async (req) => {
    const b = parse(
      z.object({
        id: zId,
        goalId: zId,
        text: zText(300).min(1),
        date: zDate,
        repeatDaily: z.boolean().default(false),
        minValue: z.number().nonnegative().max(1e9).optional(),
        unit: zText(20).optional(),
      }),
      req.body,
    );
    const { membership, stream } = await requireMember(db, req.userId);
    checkDate(b.date, stream.timezone, 1, 60);
    await ownGoal(db, membership.id, b.goalId);
    await db.query(
      `insert into tasks (id, membership_id, goal_id, text, date, repeat_daily, min_value, unit)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing`,
      [b.id, membership.id, b.goalId, b.text, b.date, b.repeatDaily, b.minValue ?? null, b.unit ?? null],
    );
    return { ok: true };
  });

  app.delete('/me/tasks/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const { membership } = await requireMember(db, req.userId);
    const [t] = await db.query<{ from_moderator: boolean }>('select from_moderator from tasks where id = $1 and membership_id = $2', [id, membership.id]);
    if (!t) throw notFound('Задача не найдена');
    if (t.from_moderator) throw forbidden('Задачу поставил модератор — удалить её нельзя');
    await db.query('update tasks set deleted_at = now() where id = $1', [id]);
    return { ok: true };
  });

  app.put('/me/tasks/:id/completions/:date', async (req) => {
    const p = parse(z.object({ id: zId, date: zDate }), req.params);
    const b = parse(z.object({ done: z.boolean() }), req.body);
    const { membership, stream } = await requireMember(db, req.userId);
    checkDate(p.date, stream.timezone, 7, 0);
    const [t] = await db.query('select 1 from tasks where id = $1 and membership_id = $2 and deleted_at is null', [p.id, membership.id]);
    if (!t) throw notFound('Задача не найдена');
    await db.query(
      `insert into task_completions (task_id, date, done) values ($1, $2, $3)
       on conflict (task_id, date) do update set done = excluded.done, updated_at = now()`,
      [p.id, p.date, b.done],
    );
    return { ok: true };
  });

  /* --- Утреннее заявление --- */
  app.put('/me/statements/:date', async (req) => {
    const { date } = parse(z.object({ date: zDate }), req.params);
    const b = parse(z.object({ text: zText(2000).min(1) }), req.body);
    const { membership, stream } = await requireMember(db, req.userId);
    if (!stream.modules || !(stream.modules as { statements?: boolean }).statements) throw forbidden('Раздел выключен модератором');
    checkDate(date, stream.timezone, 0, 0);
    await db.query(
      `insert into statements (membership_id, date, text) values ($1, $2, $3)
       on conflict (membership_id, date) do update set text = excluded.text, sent_at = now()`,
      [membership.id, date, b.text],
    );
    return { ok: true };
  });

  app.delete('/me/statements/:date', async (req) => {
    const { date } = parse(z.object({ date: zDate }), req.params);
    const { membership, stream } = await requireMember(db, req.userId);
    checkDate(date, stream.timezone, 0, 0);
    await db.query('delete from statements where membership_id = $1 and date = $2', [membership.id, date]);
    return { ok: true };
  });

  /* --- Шаги и нормативы --- */
  app.put('/me/steps/:date', async (req) => {
    const { date } = parse(z.object({ date: zDate }), req.params);
    const b = parse(z.object({ count: z.number().int().min(0).max(200_000) }), req.body);
    const { membership, stream } = await requireMember(db, req.userId);
    checkDate(date, stream.timezone, 1, 0);
    await db.query(
      `insert into steps (membership_id, date, count) values ($1, $2, $3)
       on conflict (membership_id, date) do update set count = excluded.count, updated_at = now()`,
      [membership.id, date, b.count],
    );
    return { ok: true };
  });

  app.put('/me/fitness/:date/:normId', async (req) => {
    const p = parse(z.object({ date: zDate, normId: z.string().min(1).max(40) }), req.params);
    const b = parse(z.object({ value: z.number().min(0).max(100_000) }), req.body);
    const { membership, stream } = await requireMember(db, req.userId);
    checkDate(p.date, stream.timezone, 1, 0);
    const norms = (stream.norms as { id: string }[]) ?? [];
    if (!norms.some((n) => n.id === p.normId)) throw notFound('Такого норматива в потоке нет');
    await db.query(
      `insert into fitness (membership_id, date, norm_id, value) values ($1, $2, $3, $4)
       on conflict (membership_id, date, norm_id) do update set value = excluded.value`,
      [membership.id, p.date, p.normId, b.value],
    );
    return { ok: true };
  });

  /* --- Цели --- */
  app.put('/me/goals/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const b = parse(
      z.object({ result: zText(300).optional(), criteria: zCriteria.optional(), splitWeekly: z.boolean().optional(), title: zText(60).min(1).optional() }),
      req.body,
    );
    const { membership } = await requireMember(db, req.userId);
    const g = await ownGoal(db, membership.id, id);
    if (b.title !== undefined && !g.custom) throw forbidden('Название цели задаёт модератор');
    await db.query(
      `update goals set
         result = coalesce($2, result),
         criteria = coalesce($3::jsonb, criteria),
         split_weekly = coalesce($4, split_weekly),
         title = coalesce($5, title)
       where id = $1`,
      [id, b.result ?? null, b.criteria ? JSON.stringify(b.criteria) : null, b.splitWeekly ?? null, b.title ?? null],
    );
    return { ok: true };
  });

  app.post('/me/goals', async (req) => {
    const b = parse(z.object({ id: zId, title: zText(60).min(1), result: zText(300).min(1) }), req.body);
    const { membership } = await requireMember(db, req.userId);
    const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from goals where membership_id = $1 and custom', [membership.id]);
    if (n >= 5) throw badRequest('too_many_goals', 'Своих целей может быть не больше пяти');
    await db.query(
      `insert into goals (id, membership_id, title, color, result, custom, position)
       values ($1, $2, $3, '#9AA6B2', $4, true, 100) on conflict (id) do nothing`,
      [b.id, membership.id, b.title, b.result],
    );
    return { ok: true };
  });

  app.post('/me/interim', async (req) => {
    const b = parse(
      z.object({
        id: zId,
        goalId: zId,
        horizon: z.enum(['day', 'week', 'month', 'quarter']),
        text: zText(200).min(1),
        target: z.number().positive().max(1e9).optional(),
        unit: zText(20).optional(),
      }),
      req.body,
    );
    const { membership, stream } = await requireMember(db, req.userId);
    await ownGoal(db, membership.id, b.goalId);
    await db.query(
      `insert into interim_goals (id, membership_id, goal_id, horizon, text, target, unit, start_date)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing`,
      [b.id, membership.id, b.goalId, b.horizon, b.text, b.target ?? null, b.unit ?? null, todayIn(stream.timezone)],
    );
    return { ok: true };
  });

  app.put('/me/interim/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const b = parse(z.object({ progress: z.number().min(0).max(1e9) }), req.body);
    const { membership } = await requireMember(db, req.userId);
    const [r] = await db.query('update interim_goals set progress = $3 where id = $1 and membership_id = $2 returning id', [id, membership.id, b.progress]);
    if (!r) throw notFound('Цель не найдена');
    return { ok: true };
  });
}
