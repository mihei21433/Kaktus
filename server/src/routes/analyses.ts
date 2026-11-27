/** Анализы: замеры, бланки, значения показателей, индекс здоровья, журнал доступа. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { BY_ID, CATALOG, type Override, type Overrides, type Range, type Sex, streamCatalog } from '../analyses/catalog.js';
import { buildAnalyses } from '../analyses/service.js';
import { requireModerator, requireOwner, requireStreamAccess } from '../access.js';
import type { Deps } from '../context.js';
import type { Queryable } from '../db/index.js';
import { BLANK_TYPES } from '../files.js';
import { parseBlank, type Found } from '../recognition/blank.js';
import { fileText, OcrError } from '../recognition/ocr.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { addDays, todayIn } from '../lib/time.js';
import { parse, zDate, zId, zText } from '../lib/validate.js';
import { requireMember } from '../membership.js';
import { STREAM_SELECT, type StreamRow } from '../streams.js';

async function userSex(q: Queryable, userId: string): Promise<Sex | null> {
  const [u] = await q.query<{ sex: Sex | null }>('select sex from users where id = $1', [userId]);
  return u?.sex ?? null;
}

/** Модератор открыл данные о здоровье участника — запись в журнал (обещано в согласии). */
export async function logAccess(q: Queryable, moderatorId: string, membershipId: string, kind: 'dossier' | 'analyses' | 'blank' | 'audio') {
  await q.query('insert into access_log (moderator_id, membership_id, kind) values ($1, $2, $3)', [moderatorId, membershipId, kind]);
}

function analysesOn(stream: StreamRow) {
  if ((stream.modules as { analyses?: boolean })?.analyses === false) throw forbidden('Раздел выключен модератором');
}

export async function analysesRoutes(app: FastifyInstance, { db, files, auth }: Deps) {
  /* ---------- Участник ---------- */

  async function myMeasurement(userId: string, measurementId: string, forWrite: boolean) {
    const { membership, stream } = await requireMember(db, userId);
    analysesOn(stream);
    const [m] = await db.query<{ id: string; closed_at: Date | null; opens_on: string }>(
      'select id, closed_at, opens_on::text as opens_on from measurements where id = $1 and stream_id = $2',
      [measurementId, stream.id],
    );
    if (!m) throw notFound('Замер не найден');
    if (forWrite && (m.closed_at || m.opens_on > todayIn(stream.timezone))) throw conflict('measurement_closed', 'Замер закрыт — загрузить в него нельзя');
    return { membership, stream };
  }

  app.get('/me/analyses', async (req) => {
    const { membership, stream } = await requireMember(db, req.userId);
    return buildAnalyses(db, membership, stream, await userSex(db, req.userId));
  });

  app.put('/me/sex', async (req) => {
    const b = parse(z.object({ sex: z.enum(['female', 'male']) }), req.body);
    await db.query('update users set sex = $2 where id = $1', [req.userId, b.sex]);
    return { ok: true };
  });

  app.post('/me/measurements/:mid/blanks', { bodyLimit: 15 * 1024 * 1024 }, async (req) => {
    const { mid } = parse(z.object({ mid: zId }), req.params);
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const ext = BLANK_TYPES[type];
    if (!ext) throw new ApiError(415, 'bad_file', 'Загрузите фото (JPG, PNG, HEIC) или PDF');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 100) throw badRequest('empty_file', 'Файл пустой');
    const name = decodeURIComponent(String(req.headers['x-file-name'] ?? `бланк.${ext}`)).slice(0, 120);
    const { membership } = await myMeasurement(req.userId, mid, true);
    const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from blanks where membership_id = $1 and measurement_id = $2', [membership.id, mid]);
    if (n >= 20) throw badRequest('too_many_blanks', 'В замере может быть не больше 20 бланков');
    const rel = await files.saveBlank(membership.id, ext, body);
    const [b] = await db.query<{ id: string }>(
      'insert into blanks (membership_id, measurement_id, file_path, file_name, mime, size) values ($1, $2, $3, $4, $5, $6) returning id',
      [membership.id, mid, rel, name, type, body.length],
    );
    return { id: b.id };
  });

  app.delete('/me/blanks/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const { membership } = await requireMember(db, req.userId);
    const [b] = await db.query<{ file_path: string }>('delete from blanks where id = $1 and membership_id = $2 returning file_path', [id, membership.id]);
    if (!b) throw notFound('Бланк не найден');
    await files.remove(b.file_path);
    return { ok: true };
  });

  app.get('/me/blanks/:id/link', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const { membership } = await requireMember(db, req.userId);
    const [b] = await db.query('select 1 from blanks where id = $1 and membership_id = $2', [id, membership.id]);
    if (!b) throw notFound('Бланк не найден');
    return { url: `/v1/files/blank/${await auth.blankToken(id)}` };
  });

  app.put('/me/measurements/:mid/values/:ind', async (req) => {
    const p = parse(z.object({ mid: zId, ind: z.string().max(40) }), req.params);
    const b = parse(z.object({ value: z.number().min(0).max(1e6), comparator: z.enum(['=', '<', '>']).default('=') }), req.body);
    const { membership, stream } = await myMeasurement(req.userId, p.mid, true);
    if (!streamCatalog(stream.indicator_norms).some((i) => i.id === p.ind)) throw notFound('Такого показателя в потоке нет');
    await db.query(
      `insert into analysis_values (membership_id, measurement_id, indicator_id, value, comparator) values ($1, $2, $3, $4, $5)
       on conflict (membership_id, measurement_id, indicator_id) do update set value = excluded.value, comparator = excluded.comparator, updated_at = now()`,
      [membership.id, p.mid, p.ind, b.value, b.comparator],
    );
    return { ok: true };
  });

  app.delete('/me/measurements/:mid/values/:ind', async (req) => {
    const p = parse(z.object({ mid: zId, ind: z.string().max(40) }), req.params);
    const { membership } = await myMeasurement(req.userId, p.mid, true);
    await db.query('delete from analysis_values where membership_id = $1 and measurement_id = $2 and indicator_id = $3', [membership.id, p.mid, p.ind]);
    return { ok: true };
  });

  app.post('/me/measurements/:mid/submit', async (req) => {
    const { mid } = parse(z.object({ mid: zId }), req.params);
    const { membership } = await myMeasurement(req.userId, mid, true);
    const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from analysis_values where membership_id = $1 and measurement_id = $2', [membership.id, mid]);
    if (!n) throw badRequest('no_values', 'Введите хотя бы один показатель');
    await db.query(
      `insert into measurement_results (membership_id, measurement_id) values ($1, $2)
       on conflict (membership_id, measurement_id) do update set submitted_at = now()`,
      [membership.id, mid],
    );
    return { ok: true, filled: n };
  });

  /**
   * Распознать бланки замера: текст читается на нашем сервере, значения НЕ сохраняются —
   * участник проверяет их на экране «Проверка распознанного» и сохраняет сам.
   */
  app.post('/me/measurements/:mid/recognize', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req) => {
    const { mid } = parse(z.object({ mid: zId }), req.params);
    const { membership, stream } = await myMeasurement(req.userId, mid, true);
    const blanks = await db.query<{ id: string; file_path: string; file_name: string }>(
      'select id, file_path, file_name from blanks where membership_id = $1 and measurement_id = $2 order by created_at',
      [membership.id, mid],
    );
    if (!blanks.length) throw badRequest('no_blanks', 'Сначала загрузите фото или PDF бланка');
    const catalog = streamCatalog(stream.indicator_norms);
    const merged = new Map<string, Found>();
    const report: { id: string; fileName: string; found: number; error?: string }[] = [];
    for (const b of blanks) {
      try {
        const text = await fileText(files.absPath(b.file_path), b.file_path.split('.').pop()!.toLowerCase());
        const found = parseBlank(text).filter((f) => catalog.some((c) => c.id === f.indicatorId));
        for (const f of found) if (!merged.has(f.indicatorId)) merged.set(f.indicatorId, f);
        report.push({ id: b.id, fileName: b.file_name, found: found.length });
      } catch (e) {
        if (!(e instanceof OcrError)) req.log.error(e, 'распознавание бланка');
        report.push({ id: b.id, fileName: b.file_name, found: 0, error: e instanceof OcrError ? e.message : 'Не получилось прочитать файл' });
      }
    }
    if (report.every((r) => r.error) && report[0].error === 'Распознавание на сервере не настроено') throw new ApiError(503, 'ocr_unavailable', report[0].error);
    const saved = await db.query<{ indicator_id: string; value: unknown; comparator: string }>(
      'select indicator_id, value, comparator from analysis_values where membership_id = $1 and measurement_id = $2',
      [membership.id, mid],
    );
    const found = catalog
      .filter((c) => merged.has(c.id))
      .map((c) => {
        const f = merged.get(c.id)!;
        const cur = saved.find((s) => s.indicator_id === c.id);
        return { ...f, name: c.name, unit: c.unit, current: cur ? { value: Number(cur.value), comparator: cur.comparator } : null };
      });
    return { found, blanks: report, total: catalog.length };
  });

  /** Сохранить несколько значений разом (после проверки распознанного). */
  app.put('/me/measurements/:mid/values', async (req) => {
    const { mid } = parse(z.object({ mid: zId }), req.params);
    const b = parse(
      z.object({
        values: z
          .array(z.object({ indicatorId: z.string().max(40), value: z.number().min(0).max(1e6), comparator: z.enum(['=', '<', '>']).default('=') }))
          .min(1)
          .max(60),
      }),
      req.body,
    );
    const { membership, stream } = await myMeasurement(req.userId, mid, true);
    const catalog = streamCatalog(stream.indicator_norms);
    const bad = b.values.find((v) => !catalog.some((c) => c.id === v.indicatorId));
    if (bad) throw notFound(`Такого показателя в потоке нет: ${bad.indicatorId}`);
    await db.tx(async (q) => {
      for (const v of b.values) {
        await q.query(
          `insert into analysis_values (membership_id, measurement_id, indicator_id, value, comparator) values ($1, $2, $3, $4, $5)
           on conflict (membership_id, measurement_id, indicator_id) do update set value = excluded.value, comparator = excluded.comparator, updated_at = now()`,
          [membership.id, mid, v.indicatorId, v.value, v.comparator],
        );
      }
    });
    return { ok: true, saved: b.values.length };
  });

  /** Кто из модераторов и когда открывал мои данные о здоровье. */
  app.get('/me/access-log', async (req) => {
    return db.query(
      `select a.created_at as "at", a.kind, coalesce(nullif(u.name, ''), 'Модератор') as moderator
       from access_log a join memberships m on m.id = a.membership_id left join users u on u.id = a.moderator_id
       where m.user_id = $1 order by a.created_at desc limit 200`,
      [req.userId],
    );
  });

  /* ---------- Модератор ---------- */

  async function requireModeratorOf(userId: string, streamId: string) {
    await requireModerator(db, userId);
    await requireStreamAccess(db, userId, streamId);
  }

  async function requireOwnerOf(userId: string, streamId: string) {
    await requireModerator(db, userId);
    await requireOwner(db, userId, streamId);
  }

  async function memberForModerator(userId: string, membershipId: string) {
    const [m] = await db.query<{ id: string; stream_id: string; user_id: string; decided_at: Date | null; requested_at: Date }>(
      'select id, stream_id, user_id, decided_at, requested_at from memberships where id = $1',
      [membershipId],
    );
    if (!m) throw notFound('Участник не найден');
    await requireModeratorOf(userId, m.stream_id);
    const [s] = await db.query<StreamRow>(`${STREAM_SELECT} where s.id = $1`, [m.stream_id]);
    return { m, s };
  }

  app.get('/mod/streams/:id/measurements', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireModeratorOf(req.userId, id);
    return db.query(
      `select ms.id, ms.name, ms.opens_on::text as "opensOn", ms.deadline::text as deadline, ms.closed_at as "closedAt",
              (select count(*)::int from measurement_results r where r.measurement_id = ms.id) as submitted
       from measurements ms where ms.stream_id = $1 order by ms.opens_on desc, ms.created_at desc`,
      [id],
    );
  });

  app.post('/mod/streams/:id/measurements', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const b = parse(z.object({ name: zText(60).min(1), deadline: zDate, opensOn: zDate.optional() }), req.body);
    await requireOwnerOf(req.userId, id);
    const [s] = await db.query<{ timezone: string }>('select timezone from streams where id = $1', [id]);
    const opens = b.opensOn ?? todayIn(s.timezone);
    if (b.deadline < opens) throw badRequest('bad_date', 'Срок сдачи раньше открытия замера');
    if (b.deadline > addDays(opens, 365)) throw badRequest('bad_date', 'Слишком далёкий срок');
    const [m] = await db.query<{ id: string }>('insert into measurements (stream_id, name, opens_on, deadline) values ($1, $2, $3, $4) returning id', [id, b.name, opens, b.deadline]);
    return { id: m.id };
  });

  app.post('/mod/measurements/:id/close', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const [m] = await db.query<{ stream_id: string }>('select stream_id from measurements where id = $1', [id]);
    if (!m) throw notFound('Замер не найден');
    await requireOwnerOf(req.userId, m.stream_id);
    await db.query('update measurements set closed_at = coalesce(closed_at, now()) where id = $1', [id]);
    return { ok: true };
  });

  app.get('/mod/members/:id/analyses', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const { m, s } = await memberForModerator(req.userId, id);
    await logAccess(db, req.userId, m.id, 'analyses');
    return buildAnalyses(db, m, s, await userSex(db, m.user_id));
  });

  app.get('/mod/members/:id/blanks/:bid/link', async (req) => {
    const p = parse(z.object({ id: zId, bid: zId }), req.params);
    const { m } = await memberForModerator(req.userId, p.id);
    const [b] = await db.query('select 1 from blanks where id = $1 and membership_id = $2', [p.bid, m.id]);
    if (!b) throw notFound('Бланк не найден');
    await logAccess(db, req.userId, m.id, 'blank');
    return { url: `/v1/files/blank/${await auth.blankToken(p.bid)}` };
  });

  /* ---------- Нормы анализов потока ---------- */

  const zRange = z
    .object({ lo: z.number().min(0).max(1e6).optional(), hi: z.number().min(0).max(1e6).optional() })
    .refine((r) => r.lo !== undefined || r.hi !== undefined, 'Укажите хотя бы одну границу')
    .refine((r) => r.lo === undefined || r.hi === undefined || r.lo < r.hi, 'Нижняя граница должна быть меньше верхней');

  async function streamOverrides(streamId: string): Promise<Overrides> {
    const [s] = await db.query<{ indicator_norms: Overrides }>('select indicator_norms from streams where id = $1', [streamId]);
    return s?.indicator_norms ?? {};
  }

  /** Все показатели: общая норма, норма потока и учитывается ли показатель. */
  app.get('/mod/streams/:id/indicators', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    await requireModeratorOf(req.userId, id);
    const o = await streamOverrides(id);
    return CATALOG.map((i) => {
      const ov = o[i.id];
      const bySex = !i.norm;
      const pick = (r: Range | 'cycle' | undefined) => (r === 'cycle' ? null : (r ?? null));
      return {
        id: i.id,
        group: i.group,
        name: i.name,
        unit: i.unit,
        bySex,
        cycle: i.female === 'cycle',
        off: !!ov?.off,
        changed: !!(ov && (ov.norm || ov.female || ov.male)),
        default: bySex ? { female: pick(i.female), male: pick(i.male) } : { norm: i.norm! },
        current: bySex ? { female: ov?.female ?? pick(i.female), male: ov?.male ?? pick(i.male) } : { norm: ov?.norm ?? i.norm! },
      };
    });
  });

  app.put('/mod/streams/:id/indicators/:ind', async (req) => {
    const p = parse(z.object({ id: zId, ind: z.string().max(40) }), req.params);
    const b = parse(z.object({ off: z.boolean().default(false), norm: zRange.optional(), female: zRange.optional(), male: zRange.optional() }), req.body);
    await requireOwnerOf(req.userId, p.id);
    const ind = BY_ID.get(p.ind);
    if (!ind) throw notFound('Такого показателя нет');
    if (ind.norm && (b.female || b.male)) throw badRequest('bad_norm', 'У этого показателя одна норма для всех');
    if (!ind.norm && b.norm) throw badRequest('bad_norm', 'У этого показателя нормы отдельно для женщин и мужчин');
    const ov: Override = {};
    if (b.off) ov.off = true;
    if (b.norm) ov.norm = b.norm;
    if (b.female) ov.female = b.female;
    if (b.male) ov.male = b.male;
    const key = `{${p.ind}}`;
    if (Object.keys(ov).length) await db.query('update streams set indicator_norms = jsonb_set(indicator_norms, $2, $3::jsonb) where id = $1', [p.id, key, JSON.stringify(ov)]);
    else await db.query('update streams set indicator_norms = indicator_norms - $2 where id = $1', [p.id, p.ind]);
    return { ok: true };
  });

  /** Вернуть общую норму и включить показатель обратно. */
  app.delete('/mod/streams/:id/indicators/:ind', async (req) => {
    const p = parse(z.object({ id: zId, ind: z.string().max(40) }), req.params);
    await requireOwnerOf(req.userId, p.id);
    await db.query('update streams set indicator_norms = indicator_norms - $2 where id = $1', [p.id, p.ind]);
    return { ok: true };
  });
}
