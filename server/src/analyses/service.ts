/** Сводка анализов участника: замеры, значения, статусы, индекс здоровья. */
import type { Queryable } from '../db/index.js';
import { todayIn } from '../lib/time.js';
import { memberStats } from '../stats.js';
import type { StreamRow } from '../streams.js';
import { CATALOG, GROUPS, normFor, normLabel, type Range, scoreOf, type Sex, statusOf, type Status } from './catalog.js';

/** Веса блоков индекса здоровья (макет «Панель анализов»). */
export const WEIGHTS = { analyses: 0.6, fitness: 0.25, regularity: 0.15 };

type MeasurementRow = { id: string; name: string; opens_on: string; deadline: string; closed_at: Date | null };

export async function buildAnalyses(q: Queryable, membership: { id: string; decided_at: Date | null; requested_at: Date }, stream: StreamRow & { target_index?: number }, sex: Sex | null) {
  const today = todayIn(stream.timezone);
  const catalog = CATALOG.map((i) => {
    const norm = normFor(i, sex);
    return { id: i.id, group: i.group, name: i.name, unit: i.unit, norm, normLabel: normLabel(norm, i, sex) };
  });

  const ms = await q.query<MeasurementRow>(
    `select id, name, opens_on::text as opens_on, deadline::text as deadline, closed_at
     from measurements where stream_id = $1 order by opens_on, created_at`,
    [stream.id],
  );
  const submitted = new Map(
    (await q.query<{ measurement_id: string; submitted_at: Date }>('select measurement_id, submitted_at from measurement_results where membership_id = $1', [membership.id])).map((r) => [r.measurement_id, r.submitted_at]),
  );
  const values = await q.query<{ measurement_id: string; indicator_id: string; value: unknown; comparator: string }>(
    'select measurement_id, indicator_id, value, comparator from analysis_values where membership_id = $1',
    [membership.id],
  );
  const blanks = await q.query<{ id: string; measurement_id: string; file_name: string; mime: string; size: number; created_at: Date }>(
    'select id, measurement_id, file_name, mime, size, created_at from blanks where membership_id = $1 order by created_at',
    [membership.id],
  );

  // Физнормативы и регулярность — общие для всех замеров (на сегодня)
  const fitness = await fitnessScore(q, membership.id, stream);
  const st = (await memberStats(q, [membership], stream)).get(membership.id)!;
  const reg = [st.taskRate ?? 0, st.statementDays ? st.statementsSent / st.statementDays : 0];
  const regularity = reg.reduce((a, b) => a + b, 0) / reg.length;

  const measurements = ms.map((m) => {
    const vals: Record<string, { value: number; comparator: string; status: Status }> = {};
    const summary = { filled: 0, normal: 0, border: 0, deviation: 0, unknown: 0, total: CATALOG.length };
    let scoreSum = 0;
    let scored = 0;
    for (const ind of catalog) {
      const v = values.find((x) => x.measurement_id === m.id && x.indicator_id === ind.id);
      if (v) {
        const value = Number(v.value);
        const status = statusOf(value, ind.norm);
        vals[ind.id] = { value, comparator: v.comparator, status };
        summary.filled++;
        if (status === 'normal') summary.normal++;
        else if (status === 'border') summary.border++;
        else if (status === 'unknown') summary.unknown++;
        else summary.deviation++;
      }
      if (ind.norm) {
        scored++;
        scoreSum += v ? scoreOf(Number(v.value), ind.norm)! : 0; // несданный показатель — ноль баллов
      }
    }
    const isSubmitted = submitted.has(m.id);
    const analysesScore = scored ? scoreSum / scored : null;
    let index: { total: number; analyses: number | null; fitness: number | null; regularity: number } | null = null;
    if (isSubmitted && analysesScore !== null) {
      const parts: [number, number][] = [[analysesScore, WEIGHTS.analyses], [regularity, WEIGHTS.regularity]];
      if (fitness !== null) parts.push([fitness, WEIGHTS.fitness]);
      const w = parts.reduce((a, [, x]) => a + x, 0);
      const total = parts.reduce((a, [s, x]) => a + s * x, 0) / w;
      index = { total: pct(total), analyses: pct(analysesScore), fitness: fitness === null ? null : pct(fitness), regularity: pct(regularity) };
    }
    return {
      id: m.id,
      name: m.name,
      opensOn: m.opens_on,
      deadline: m.deadline,
      open: !m.closed_at && m.opens_on <= today,
      submittedAt: submitted.get(m.id) ?? null,
      blanks: blanks
        .filter((b) => b.measurement_id === m.id)
        .map((b) => ({ id: b.id, fileName: b.file_name, mime: b.mime, size: b.size, createdAt: b.created_at })),
      values: vals,
      summary,
      index,
    };
  });

  const current = [...measurements].reverse().find((m) => m.open) ?? null;
  return {
    sex,
    groups: GROUPS,
    catalog,
    targetIndex: stream.target_index ?? 75,
    weights: WEIGHTS,
    measurements,
    currentId: current?.id ?? null,
  };
}

const pct = (x: number) => Math.round(x * 100);

/** Физнормативы: среднее по нормативам потока от последнего значения к норме, не выше 100%. */
async function fitnessScore(q: Queryable, membershipId: string, stream: StreamRow): Promise<number | null> {
  const norms = (stream.norms as { id: string; norm: number }[]) ?? [];
  if (!norms.length || (stream.modules as { steps?: boolean })?.steps === false) return null;
  let sum = 0;
  for (const n of norms) {
    const [last] = await q.query<{ value: unknown }>(
      'select value from fitness where membership_id = $1 and norm_id = $2 order by date desc limit 1',
      [membershipId, n.id],
    );
    sum += last ? Math.min(1, Number(last.value) / n.norm) : 0;
  }
  return sum / norms.length;
}

/** Короткая сводка для экрана «Сегодня» и профиля. */
export function shortSummary(a: Awaited<ReturnType<typeof buildAnalyses>>) {
  const cur = a.measurements.find((m) => m.id === a.currentId);
  const lastIndex = [...a.measurements].reverse().find((m) => m.index)?.index?.total ?? null;
  return {
    current: cur ? { id: cur.id, name: cur.name, deadline: cur.deadline, submitted: !!cur.submittedAt } : null,
    index: lastIndex,
    targetIndex: a.targetIndex,
  };
}

export type { Range };
