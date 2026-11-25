/**
 * Показатели участников для модератора: статус (по плану / отстаёт / без отправок / новый),
 * выполнение задач, шаги, заявления, просрочки, серия и история по дням.
 */
import type { Queryable } from './db/index.js';
import { addDays, todayIn } from './lib/time.js';

export type MemberLabel = 'new' | 'on_plan' | 'behind' | 'no_reports';

/** Пороги из макета «Правила потока → Статусы участников». */
export const RULES = { onPlanRate: 0.7, activeWithinDays: 2, silentDays: 3 };

const HISTORY_DAYS = 14;

type TaskRow = { id: string; membership_id: string; text: string; date: string; repeat_daily: boolean; from_moderator: boolean; comment: string | null };

export type DayView = {
  date: string;
  tasks: { id: string; text: string; done: boolean; fromModerator: boolean; doneAt?: string }[];
  steps: number | null;
  statement: { text: string; sentAt: string; kind: string; durationSec: number | null } | null;
};

export type MemberStats = {
  label: MemberLabel;
  dayInStream: number;
  today: { done: number; total: number; steps: number | null; statement: boolean };
  taskRate: number | null;
  avgSteps: number | null;
  stepsBelow: number;
  statementsSent: number;
  statementDays: number;
  overdue: number;
  streak: number;
  lastActivity: string | null;
  days: DayView[];
};

function diff(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

export async function memberStats(
  q: Queryable,
  members: { id: string; decided_at: Date | null; requested_at: Date }[],
  stream: { timezone: string; steps_threshold: number },
): Promise<Map<string, MemberStats>> {
  const result = new Map<string, MemberStats>();
  if (!members.length) return result;
  const ids = members.map((m) => m.id);
  const today = todayIn(stream.timezone);
  const from = addDays(today, -(HISTORY_DAYS - 1));

  const tasks = await q.query<TaskRow>(
    `select id, membership_id, text, date::text as date, repeat_daily, from_moderator, comment
     from tasks where membership_id = any($1) and deleted_at is null and date <= $2 order by created_at`,
    [ids, today],
  );
  const comps = await q.query<{ task_id: string; date: string; updated_at: Date }>(
    `select c.task_id, c.date::text as date, c.updated_at from task_completions c join tasks t on t.id = c.task_id
     where t.membership_id = any($1) and c.done and c.date >= $2`,
    [ids, from],
  );
  const statements = await q.query<{ membership_id: string; date: string; text: string; sent_at: Date; kind: string; duration_sec: number | null }>(
    'select membership_id, date::text as date, text, sent_at, kind, duration_sec from statements where membership_id = any($1) and date >= $2',
    [ids, from],
  );
  const steps = await q.query<{ membership_id: string; date: string; count: number }>(
    'select membership_id, date::text as date, count from steps where membership_id = any($1) and date >= $2',
    [ids, from],
  );

  const done = new Map<string, Date>(comps.map((c) => [`${c.task_id}|${c.date}`, c.updated_at]));

  for (const m of members) {
    const joined = todayIn(stream.timezone, m.decided_at ?? m.requested_at);
    const dayInStream = Math.max(1, diff(today, joined) + 1);
    const myTasks = tasks.filter((t) => t.membership_id === m.id);
    const myStatements = new Map(statements.filter((s) => s.membership_id === m.id).map((s) => [s.date, s]));
    const mySteps = new Map(steps.filter((s) => s.membership_id === m.id).map((s) => [s.date, s.count]));

    const days: DayView[] = [];
    for (let i = 0; i < HISTORY_DAYS; i++) {
      const date = addDays(today, -i);
      if (date < joined) break;
      const dayTasks = myTasks
        .filter((t) => (t.repeat_daily ? t.date <= date : t.date === date))
        .map((t) => {
          const at = done.get(`${t.id}|${date}`);
          return { id: t.id, text: t.text, done: !!at, fromModerator: t.from_moderator, doneAt: at?.toISOString() };
        });
      const st = myStatements.get(date);
      days.push({
        date,
        tasks: dayTasks,
        steps: mySteps.get(date) ?? null,
        statement: st ? { text: st.text, sentAt: st.sent_at.toISOString?.() ?? String(st.sent_at), kind: st.kind, durationSec: st.duration_sec } : null,
      });
    }

    const active = (d: DayView) => d.tasks.some((t) => t.done) || !!d.statement || d.steps !== null;
    const lastActive = days.find(active)?.date ?? null;

    // Выполнение за прошедшие дни (до вчера), а в первый день — за сегодня
    const window = days.filter((d) => d.date < today).slice(0, 7);
    const rated = window.length ? window : days.slice(0, 1);
    const total = rated.reduce((n, d) => n + d.tasks.length, 0);
    const doneN = rated.reduce((n, d) => n + d.tasks.filter((t) => t.done).length, 0);
    const taskRate = total ? doneN / total : null;

    let label: MemberLabel;
    const silence = lastActive ? diff(today, lastActive) : dayInStream;
    // Первый день не оцениваем: он ещё не закончился
    if (dayInStream === 1 || (!lastActive && dayInStream <= 2)) label = 'new';
    else if (silence >= RULES.silentDays) label = 'no_reports';
    else if ((taskRate ?? 0) >= RULES.onPlanRate && silence < RULES.activeWithinDays) label = 'on_plan';
    else label = 'behind';

    const stepVals = days.map((d) => d.steps).filter((v): v is number => v !== null);
    let streak = 0;
    for (const d of days[0] && !active(days[0]) ? days.slice(1) : days) {
      if (!active(d)) break;
      streak++;
    }
    const todayView = days[0]?.date === today ? days[0] : undefined;

    result.set(m.id, {
      label,
      dayInStream,
      today: {
        done: todayView?.tasks.filter((t) => t.done).length ?? 0,
        total: todayView?.tasks.length ?? 0,
        steps: todayView?.steps ?? null,
        statement: !!todayView?.statement,
      },
      taskRate,
      avgSteps: stepVals.length ? Math.round(stepVals.reduce((a, b) => a + b, 0) / stepVals.length) : null,
      stepsBelow: stepVals.filter((v) => v < stream.steps_threshold).length,
      statementsSent: days.filter((d) => d.statement).length,
      statementDays: days.length,
      overdue: days.filter((d) => d.date < today).reduce((n, d) => n + d.tasks.filter((t) => !t.done && !myTasks.find((x) => x.id === t.id)?.repeat_daily).length, 0),
      streak,
      lastActivity: lastActive,
      days,
    });
  }
  return result;
}
