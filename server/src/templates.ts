/** Сроки целей потока и шаблон настроек модератора. */
import type { Queryable } from './db/index.js';

export type Horizon = { id: string; name: string; days: number; base?: boolean; enabled: boolean };

export const BASE_HORIZONS: Horizon[] = [
  { id: 'day', name: 'День', days: 1, base: true, enabled: true },
  { id: 'week', name: 'Неделя', days: 7, base: true, enabled: true },
  { id: 'month', name: '1 месяц', days: 30, base: true, enabled: true },
  { id: 'quarter', name: '3 месяца', days: 90, base: true, enabled: true },
];

/** Что переносит шаблон. Название, длительность и подтверждение заявок у каждого потока свои. */
export type TemplateSettings = {
  modules: unknown;
  stepsThreshold: number;
  norms: unknown;
  indicatorNorms: unknown;
  targetIndex: number;
  reminders: unknown;
  horizons: Horizon[];
};

export async function snapshot(q: Queryable, streamId: string): Promise<TemplateSettings> {
  const [s] = await q.query<{ modules: unknown; steps_threshold: number; norms: unknown; indicator_norms: unknown; target_index: number; reminders: unknown; horizons: Horizon[] }>(
    'select modules, steps_threshold, norms, indicator_norms, target_index, reminders, horizons from streams where id = $1',
    [streamId],
  );
  return {
    modules: s.modules,
    stepsThreshold: s.steps_threshold,
    norms: s.norms,
    indicatorNorms: s.indicator_norms,
    targetIndex: s.target_index,
    reminders: s.reminders,
    horizons: s.horizons,
  };
}

/** Переносит настройки в поток. Свои сроки потока, на которые уже поставлены цели, не теряются — остаются выключенными. */
export async function applySettings(q: Queryable, streamId: string, t: TemplateSettings) {
  const used = await q.query<{ horizon: string }>(
    `select distinct i.horizon from interim_goals i join memberships m on m.id = i.membership_id where m.stream_id = $1`,
    [streamId],
  );
  const [cur] = await q.query<{ horizons: Horizon[] }>('select horizons from streams where id = $1', [streamId]);
  const horizons = [...t.horizons];
  for (const h of cur.horizons) {
    if (!horizons.some((x) => x.id === h.id) && used.some((u) => u.horizon === h.id)) horizons.push({ ...h, enabled: false });
  }
  await q.query(
    `update streams set modules = $2, steps_threshold = $3, norms = $4, indicator_norms = $5, target_index = $6, reminders = $7, horizons = $8
     where id = $1`,
    [
      streamId,
      JSON.stringify(t.modules),
      t.stepsThreshold,
      JSON.stringify(t.norms),
      JSON.stringify(t.indicatorNorms),
      t.targetIndex,
      JSON.stringify(t.reminders),
      JSON.stringify(horizons),
    ],
  );
}

export async function templateOf(q: Queryable, userId: string) {
  const [t] = await q.query<{ source_stream: string; settings: TemplateSettings; saved_at: Date }>(
    'select source_stream, settings, saved_at from moderator_templates where user_id = $1',
    [userId],
  );
  return t ?? null;
}
