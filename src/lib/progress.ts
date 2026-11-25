import { tasksForDate } from '@/data/store';
import { AppState } from '@/data/types';
import { addDays, todayKey } from './date';

export type DayStatus = 'done' | 'partial' | 'miss' | 'none';

export function dayStatus(s: AppState, date: string): DayStatus {
  const start = s.membership.stream?.startDate ?? date;
  if (date < start || date > todayKey()) return 'none';
  const tasks = tasksForDate(s.tasks, date);
  const done = tasks.filter((t) => t.completions[date]).length;
  if (!tasks.length) return s.statements[date] ? 'done' : 'none';
  if (done === tasks.length) return 'done';
  if (done > 0 || s.statements[date]) return 'partial';
  return date === todayKey() ? 'none' : 'miss';
}

export function lastDays(n: number): string[] {
  const t = todayKey();
  return Array.from({ length: n }, (_, i) => addDays(t, i - n + 1));
}

/** Серия: подряд идущие дни с активностью, считая от сегодня (или вчера, если сегодня ещё пусто). */
export function streak(s: AppState): number {
  let d = todayKey();
  if (dayStatus(s, d) === 'none') d = addDays(d, -1);
  let n = 0;
  while (['done', 'partial'].includes(dayStatus(s, d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function taskRate(s: AppState, days: string[]): number | null {
  let total = 0;
  let done = 0;
  for (const d of days) {
    const tasks = tasksForDate(s.tasks, d);
    total += tasks.length;
    done += tasks.filter((t) => t.completions[d]).length;
  }
  return total ? done / total : null;
}

export function avgSteps(s: AppState, days: string[]): number | null {
  const vals = days.map((d) => s.steps[d]).filter((v): v is number => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
