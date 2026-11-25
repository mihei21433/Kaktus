/**
 * Утренние и вечерние напоминания участникам.
 * Запускается раз в минуту. В окне 2 часа после заданного времени шлёт пуш тем,
 * кто ещё не сделал нужное; каждый вид — не чаще раза в день (reminder_log).
 * В тексте нет личных и медицинских данных: пуш идёт через внешние сервисы.
 */
import type { Db } from './db/index.js';
import type { Push } from './push.js';
import { addDays } from './lib/time.js';

export type Reminders = { enabled: boolean; morning: string; evening: string };
export const DEFAULT_REMINDERS: Reminders = { enabled: true, morning: '09:00', evening: '21:00' };
const WINDOW_MIN = 120;

/** Дата и время «на часах» потока. */
export function localClock(timeZone: string, now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

type StreamRow = {
  id: string;
  timezone: string;
  start_date: string;
  duration_days: number;
  modules: { statements?: boolean; steps?: boolean };
  reminders: Reminders;
};

export async function runReminders(db: Db, push: Push, now = new Date()): Promise<number> {
  let sent = 0;
  const streams = await db.query<StreamRow>(
    `select id, timezone, start_date::text as start_date, duration_days, modules, reminders
     from streams where coalesce((reminders->>'enabled')::boolean, true)`,
  );
  for (const s of streams) {
    const { date, minutes } = localClock(s.timezone, now);
    if (date < s.start_date || date > addDays(s.start_date, s.duration_days - 1)) continue; // поток не идёт
    for (const kind of ['morning', 'evening'] as const) {
      const at = s.reminders?.[kind];
      if (!at || !/^\d{2}:\d{2}$/.test(at)) continue;
      const since = minutes - toMinutes(at);
      if (since < 0 || since >= WINDOW_MIN) continue;

      const members = await db.query<{ id: string; user_id: string }>(
        `select m.id, m.user_id from memberships m
         where m.stream_id = $1 and m.status = 'approved'
           and not exists (select 1 from reminder_log r where r.membership_id = m.id and r.date = $2 and r.kind = $3)`,
        [s.id, date, kind],
      );
      for (const m of members) {
        const text = kind === 'morning' ? await morningText(db, m.id, date, s.modules) : await eveningText(db, m.id, date);
        if (!text) continue;
        const [ins] = await db.query(
          `insert into reminder_log (membership_id, date, kind) values ($1, $2, $3)
           on conflict do nothing returning 1 as ok`,
          [m.id, date, kind],
        );
        if (!ins) continue; // уже отправил другой процесс
        await push.notifyUser(m.user_id, text[0], text[1], { type: 'reminder', kind });
        sent++;
      }
    }
  }
  return sent;
}

async function morningText(db: Db, membershipId: string, date: string, modules: StreamRow['modules']): Promise<[string, string] | null> {
  const needStatement =
    modules?.statements !== false &&
    !(await db.query('select 1 from statements where membership_id = $1 and date = $2', [membershipId, date])).length;
  const needSteps =
    modules?.steps !== false &&
    !(await db.query('select 1 from steps where membership_id = $1 and date = $2', [membershipId, date])).length;
  if (needStatement && needSteps) return ['Доброе утро!', 'Пришлите утреннее заявление и отметьте шаги.'];
  if (needStatement) return ['Доброе утро!', 'Пришлите утреннее заявление — пара фраз о настрое и планах.'];
  if (needSteps) return ['Доброе утро!', 'Не забудьте отметить шаги.'];
  return null;
}

async function eveningText(db: Db, membershipId: string, date: string): Promise<[string, string] | null> {
  const [r] = await db.query<{ total: number; done: number }>(
    `select count(*)::int as total,
            count(*) filter (where exists (
              select 1 from task_completions c where c.task_id = t.id and c.date = $2 and c.done))::int as done
     from tasks t
     where t.membership_id = $1 and t.deleted_at is null
       and ((t.repeat_daily and t.date <= $2) or t.date = $2)`,
    [membershipId, date],
  );
  const left = r.total - r.done;
  if (left <= 0) return null;
  return ['Задачи дня', left === 1 ? 'Осталась одна задача — закройте день.' : `Осталось задач: ${left}. Отметьте сделанное.`];
}
