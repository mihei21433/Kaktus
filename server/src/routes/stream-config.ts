/** Сроки целей потока и шаблон настроек модератора. */
import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireModerator, requireOwner, requireStreamAccess } from '../access.js';
import type { Deps } from '../context.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parse, zId, zText } from '../lib/validate.js';
import { applySettings, type Horizon, snapshot, templateOf } from '../templates.js';

const MAX_CUSTOM = 8;

export async function streamConfigRoutes(app: FastifyInstance, { db }: Deps) {
  async function horizonsOf(streamId: string): Promise<Horizon[]> {
    const [s] = await db.query<{ horizons: Horizon[] }>('select horizons from streams where id = $1', [streamId]);
    if (!s) throw notFound('Поток не найден');
    return s.horizons;
  }
  const saveHorizons = (streamId: string, h: Horizon[]) => db.query('update streams set horizons = $2 where id = $1', [streamId, JSON.stringify(h)]);

  /** Сроки с числом целей участников на каждом. */
  async function view(streamId: string) {
    const counts = await db.query<{ horizon: string; n: number }>(
      `select i.horizon, count(*)::int as n from interim_goals i join memberships m on m.id = i.membership_id
       where m.stream_id = $1 group by i.horizon`,
      [streamId],
    );
    return (await horizonsOf(streamId)).map((h) => ({ ...h, base: !!h.base, goals: counts.find((c) => c.horizon === h.id)?.n ?? 0 }));
  }

  app.get('/mod/streams/:id/horizons', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireStreamAccess(db, req.userId, id);
    return view(id);
  });

  app.post('/mod/streams/:id/horizons', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    const b = parse(z.object({ name: zText(30).min(1), days: z.number().int().min(1).max(365), enabled: z.boolean().default(true) }), req.body);
    await requireOwner(db, req.userId, id);
    const list = await horizonsOf(id);
    if (list.filter((h) => !h.base).length >= MAX_CUSTOM) throw badRequest('too_many', `Своих сроков может быть не больше ${MAX_CUSTOM}`);
    const name = b.name.trim();
    if (list.some((h) => h.name.toLowerCase() === name.toLowerCase())) throw conflict('duplicate', 'Срок с таким названием уже есть');
    const h: Horizon = { id: `h_${randomBytes(4).toString('hex')}`, name, days: b.days, enabled: b.enabled };
    await saveHorizons(id, [...list, h]);
    return view(id);
  });

  /** Базовый срок можно только включить или выключить; свой — ещё переименовать и поменять длину. */
  app.patch('/mod/streams/:id/horizons/:hid', async (req) => {
    await requireModerator(db, req.userId);
    const p = parse(z.object({ id: zId, hid: z.string().min(1).max(40) }), req.params);
    const b = parse(z.object({ name: zText(30).min(1).optional(), days: z.number().int().min(1).max(365).optional(), enabled: z.boolean().optional() }), req.body);
    await requireOwner(db, req.userId, p.id);
    const list = await horizonsOf(p.id);
    const h = list.find((x) => x.id === p.hid);
    if (!h) throw notFound('Срок не найден');
    if (h.base && (b.name !== undefined || b.days !== undefined)) throw badRequest('base_horizon', 'Базовый срок можно только включить или выключить');
    if (b.name && list.some((x) => x.id !== h.id && x.name.toLowerCase() === b.name!.trim().toLowerCase())) throw conflict('duplicate', 'Срок с таким названием уже есть');
    Object.assign(h, { ...(b.name ? { name: b.name.trim() } : {}), ...(b.days ? { days: b.days } : {}), ...(b.enabled !== undefined ? { enabled: b.enabled } : {}) });
    await saveHorizons(p.id, list);
    return view(p.id);
  });

  app.delete('/mod/streams/:id/horizons/:hid', async (req) => {
    await requireModerator(db, req.userId);
    const p = parse(z.object({ id: zId, hid: z.string().min(1).max(40) }), req.params);
    await requireOwner(db, req.userId, p.id);
    const all = await view(p.id);
    const h = all.find((x) => x.id === p.hid);
    if (!h) throw notFound('Срок не найден');
    if (h.base) throw badRequest('base_horizon', 'Базовый срок нельзя удалить — только выключить');
    if (h.goals) throw conflict('has_goals', 'На этот срок уже поставлены цели участников — его можно только выключить');
    await saveHorizons(p.id, (await horizonsOf(p.id)).filter((x) => x.id !== p.hid));
    return view(p.id);
  });

  /* ---------- Шаблон ---------- */

  const templateView = (t: Awaited<ReturnType<typeof templateOf>>) => (t ? { sourceStream: t.source_stream, savedAt: t.saved_at } : null);

  app.get('/mod/template', async (req) => {
    await requireModerator(db, req.userId);
    return { template: templateView(await templateOf(db, req.userId)) };
  });

  app.post('/mod/streams/:id/template', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireStreamAccess(db, req.userId, id);
    const [s] = await db.query<{ name: string }>('select name from streams where id = $1', [id]);
    await db.query(
      `insert into moderator_templates (user_id, source_stream, settings) values ($1, $2, $3)
       on conflict (user_id) do update set source_stream = excluded.source_stream, settings = excluded.settings, saved_at = now()`,
      [req.userId, s.name, JSON.stringify(await snapshot(db, id))],
    );
    return { template: templateView(await templateOf(db, req.userId)) };
  });

  app.post('/mod/streams/:id/apply-template', async (req) => {
    await requireModerator(db, req.userId);
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireOwner(db, req.userId, id);
    const t = await templateOf(db, req.userId);
    if (!t) throw notFound('Шаблона ещё нет — сначала сохраните его в потоке-образце');
    await db.tx((q) => applySettings(q, id, t.settings));
    return { ok: true };
  });
}
