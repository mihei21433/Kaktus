import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../context.js';
import type { Queryable } from '../db/index.js';
import { normalizeCode } from '../lib/crypto.js';
import { ApiError, badRequest, conflict, notFound } from '../lib/errors.js';
import { normalizePhone } from '../lib/identity.js';
import { avatarUrl, fullName, splitName } from '../people.js';
import sharp from 'sharp';
import { parse, zText } from '../lib/validate.js';
import { buildAnalyses, shortSummary } from '../analyses/service.js';
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
  login_code_set_at: Date | null;
  contact_phone: string | null;
  first_name: string;
  last_name: string;
  avatar_path: string | null;
};

/** Полное состояние участника в формате мобильного приложения (AppState). */
export async function buildState(q: Queryable, userId: string) {
  const [u] = await q.query<UserRow>('select * from users where id = $1', [userId]);
  const m = await currentMembership(q, userId);
  const stream = m ? await loadStream(q, m.stream_id) : null;

  const state = {
    account: { phone: u.phone, email: u.email, isModerator: u.is_moderator, loginCodeSetAt: u.login_code_set_at },
    consent: u.consent_version
      ? { version: u.consent_version, acceptedAt: u.consent_accepted_at, aiTransfer: u.ai_transfer }
      : null,
    membership: m && stream
      ? { status: m.status, stream: streamView(stream), requestedAt: m.requested_at, checks: 0 }
      : { status: 'none', checks: 0 },
    profile: {
      name: u.name,
      firstName: u.first_name,
      lastName: u.last_name,
      avatarUrl: avatarUrl(u.avatar_path),
      phone: u.contact_phone ?? u.phone ?? '',
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
    analyses: null as ReturnType<typeof shortSummary> | null,
    reminders: (stream?.reminders as { enabled: boolean; morning: string; evening: string } | undefined) ?? { enabled: true, morning: '09:00', evening: '21:00' },
  };
  if (!m || m.status !== 'approved') return state;
  if (stream && (stream.modules as { analyses?: boolean })?.analyses !== false) {
    state.analyses = shortSummary(await buildAnalyses(q, m, stream, (u as UserRow & { sex: 'female' | 'male' | null }).sex));
  }

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

  const tasks = await q.query<{ id: string; goal_id: string; text: string; date: string; repeat_daily: boolean; min_value: unknown; unit: string | null; from_moderator: boolean; comment: string | null }>(
    `select id, goal_id, text, date::text as date, repeat_daily, min_value, unit, from_moderator, comment
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
    comment: t.comment ?? undefined,
    completions: byTask.get(t.id) ?? {},
  }));

  for (const s of await q.query<{ date: string; text: string; kind: string; sent_at: Date; duration_sec: number | null }>(
    'select date::text as date, text, kind, sent_at, duration_sec from statements where membership_id = $1',
    [mid],
  )) {
    state.statements[s.date] = { text: s.text, kind: s.kind, sentAt: s.sent_at, durationSec: s.duration_sec ?? undefined };
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

export async function meRoutes(app: FastifyInstance, { db, files, auth }: Deps) {
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
      z.object({
        name: zText(80).optional(),
        firstName: zText(40).optional(),
        lastName: zText(40).optional(),
        phone: z.string().max(30).optional(),
        about: zText(300),
        contract: zText(1000),
        accepted: z.boolean(),
      }),
      req.body,
    );
    if (b.firstName !== undefined) await saveNames(db, req.userId, b.firstName, b.lastName ?? '');
    else if (b.name?.trim()) {
      const n = splitName(b.name);
      await saveNames(db, req.userId, n.first, n.last);
    }
    if (b.accepted && b.contract.trim().length < 3) throw badRequest('no_contract', 'Напишите личный контракт своими словами');
    if (b.phone?.trim()) await db.query('update users set contact_phone = $2 where id = $1', [req.userId, normalizePhone(b.phone)]);
    await db.query(
      `update users set
         about = $2,
         contract = case when contract_accepted_at is null then $3 else contract end,
         contract_accepted_at = case when $4 then coalesce(contract_accepted_at, now()) else contract_accepted_at end,
         profile_completed = true
       where id = $1`,
      [req.userId, b.about, b.contract, b.accepted],
    );
    return { ok: true };
  });
  app.post('/me/profile/skip', async (req) => {
    await db.query('update users set profile_completed = true where id = $1', [req.userId]);
    return { ok: true };
  });

  /** Аккаунт: имя, фамилия, телефон для связи — и у участника, и у модератора. */
  app.put('/me/account', async (req) => {
    const b = parse(z.object({ firstName: zText(40), lastName: zText(40).default(''), phone: z.string().max(30).optional() }), req.body);
    if (!b.firstName.trim()) throw badRequest('no_name', 'Укажите имя');
    const phone = b.phone?.trim() ? normalizePhone(b.phone) : null;
    await saveNames(db, req.userId, b.firstName, b.lastName);
    await db.query('update users set contact_phone = $2 where id = $1', [req.userId, phone]);
    return { ok: true };
  });

  /** Фото профиля: обрезаем до квадрата 512×512 и сохраняем JPEG; прежнее фото удаляется. */
  app.post('/me/avatar', { bodyLimit: 15 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new ApiError(415, 'bad_file', 'Нужна фотография: JPG или PNG');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 100) throw badRequest('empty_file', 'Файл пустой');
    let jpeg: Buffer;
    try {
      jpeg = await sharp(body, { failOn: 'none' }).rotate().resize(512, 512, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
    } catch {
      throw new ApiError(415, 'bad_file', 'Не получилось открыть фото. Попробуйте другое');
    }
    const rel = await files.saveAvatar(jpeg);
    const [old] = await db.query<{ avatar_path: string | null }>('select avatar_path from users where id = $1', [req.userId]);
    await db.query('update users set avatar_path = $2 where id = $1', [req.userId, rel]);
    await files.remove(old?.avatar_path);
    return { avatarUrl: avatarUrl(rel) };
  });

  app.delete('/me/avatar', async (req) => {
    const [old] = await db.query<{ avatar_path: string | null }>('select avatar_path from users where id = $1', [req.userId]);
    await db.query('update users set avatar_path = null where id = $1', [req.userId]);
    await files.remove(old?.avatar_path);
    return { ok: true };
  });

  /** Новый личный код входа (для другого телефона). Показывается один раз; старый перестаёт работать. */
  app.post('/me/login-code', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    return { loginCode: await db.tx((q) => auth.setLoginCode(q, req.userId)) };
  });

  /* --- Поток --- */
  app.post('/me/join', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(z.object({ code: z.string().trim().min(4).max(12) }), req.body);
    return db.tx((q) => joinStream(q, req.userId, b.code));
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
    // Файлы (голосовые) удаляем вместе с аккаунтом
    const ms = await db.query<{ id: string }>('select id from memberships where user_id = $1', [req.userId]);
    const [me] = await db.query<{ avatar_path: string | null }>('select avatar_path from users where id = $1', [req.userId]);
    await files.remove(me?.avatar_path);
    await db.query('delete from users where id = $1', [req.userId]);
    for (const m of ms) await files.removeMembership(m.id);
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

/** Вступление в поток по коду: заявка (или сразу участие, если подтверждение выключено). */
export async function joinStream(q: Queryable, userId: string, code: string) {
  const [u] = await q.query<{ consent_version: string | null }>('select consent_version from users where id = $1', [userId]);
  if (!u.consent_version) throw conflict('no_consent', 'Сначала примите согласие на обработку данных');
  const cur = await currentMembership(q, userId);
  if (cur && ['pending', 'approved', 'blocked'].includes(cur.status)) {
    throw conflict('already_member', 'Вы уже подали заявку или состоите в потоке');
  }
  const [s] = await q.query<StreamRow & { require_approval: boolean }>(`${STREAM_SELECT} where s.code = $1`, [normalizeCode(code)]);
  if (!s) throw notFound('Такого кода нет. Проверьте буквы или спросите код у модератора');
  const status = s.require_approval ? 'pending' : 'approved';
  const [m] = await q.query<{ id: string }>(
    `insert into memberships (stream_id, user_id, status, decided_at) values ($1, $2, $3, case when $3 = 'approved' then now() end) returning id`,
    [s.id, userId, status],
  );
  if (status === 'approved') await seedMemberGoals(q, m.id, s.id);
  return { status, stream: streamView(s) };
}

/** Имя и фамилия; name — «Имя Фамилия» для показа модераторам. */
export async function saveNames(q: Queryable, userId: string, first: string, last: string) {
  if (!first.trim()) return;
  await q.query('update users set first_name = $2, last_name = $3, name = $4 where id = $1', [userId, first.trim(), last.trim(), fullName(first, last)]);
}
