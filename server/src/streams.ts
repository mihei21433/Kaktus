/** Потоки: создание с настройками по умолчанию, представление для приложения. */
import type { Queryable } from './db/index.js';
import { streamCode } from './lib/crypto.js';
import { addDays } from './lib/time.js';

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const DEFAULT_GOALS: { title: string; color: string; hint: string }[] = [
  { title: 'Здоровье', color: '#4FC879', hint: 'Формулируйте измеримо: вес, показатели, сон' },
  { title: 'Отношения', color: '#F0A63A', hint: 'Что именно должно измениться в отношениях' },
  { title: 'Финансы', color: '#3B9CFF', hint: 'Конкретная сумма или финансовая привычка' },
  { title: 'Личный бренд', color: '#A97BFF', hint: 'Охват, публикации, выступления' },
];

export const DEFAULT_MODULES = { statements: true, steps: true, analyses: true, goals: true, ai: false };
export const DEFAULT_NORMS = [
  { id: 'plank', name: 'Планка', unit: 'сек', norm: 90 },
  { id: 'squats', name: 'Приседания', unit: 'раз', norm: 50 },
];

export function formatDeadline(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

export async function createStream(
  q: Queryable,
  opts: { name: string; ownerId: string; startDate: string; durationDays: number; requireApproval: boolean },
) {
  const lastDay = addDays(opts.startDate, opts.durationDays - 1);
  for (let attempt = 0; ; attempt++) {
    try {
      const [s] = await q.query<{ id: string; code: string }>(
        `insert into streams (name, code, owner_id, start_date, duration_days, goal_deadline, require_approval, modules, norms)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, code`,
        [
          opts.name,
          streamCode(),
          opts.ownerId,
          opts.startDate,
          opts.durationDays,
          formatDeadline(lastDay),
          opts.requireApproval,
          JSON.stringify(DEFAULT_MODULES),
          JSON.stringify(DEFAULT_NORMS),
        ],
      );
      await q.query(`insert into stream_moderators (stream_id, user_id, role) values ($1, $2, 'owner')`, [s.id, opts.ownerId]);
      for (const [i, g] of DEFAULT_GOALS.entries()) {
        await q.query('insert into stream_goals (stream_id, title, color, hint, position) values ($1, $2, $3, $4, $5)', [
          s.id,
          g.title,
          g.color,
          g.hint,
          i,
        ]);
      }
      return s;
    } catch (e) {
      // совпал код с существующим — пробуем другой
      if (attempt < 5 && String((e as Error).message).includes('streams_code_key')) continue;
      throw e;
    }
  }
}

export type StreamRow = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  start_date: string;
  duration_days: number;
  goal_deadline: string;
  steps_threshold: number;
  require_approval: boolean;
  modules: unknown;
  norms: unknown;
  moderator: string;
};

export const STREAM_SELECT = `
  select s.id, s.name, s.code, s.timezone, s.start_date::text as start_date, s.duration_days, s.goal_deadline,
         s.steps_threshold, s.require_approval, s.modules, s.norms, coalesce(nullif(u.name, ''), 'Модератор') as moderator
  from streams s join users u on u.id = s.owner_id`;

/** Поток в формате мобильного приложения (тип Stream). */
export function streamView(s: StreamRow) {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    moderator: s.moderator,
    startDate: s.start_date,
    durationDays: s.duration_days,
    goalDeadline: s.goal_deadline,
    stepsThreshold: s.steps_threshold,
    norms: s.norms,
    modules: s.modules,
  };
}

/** При одобрении участник получает копию глобальных целей потока. */
export async function seedMemberGoals(q: Queryable, membershipId: string, streamId: string) {
  await q.query(
    `insert into goals (id, membership_id, title, color, hint, position)
     select gen_random_uuid(), $1, title, color, hint, position from stream_goals where stream_id = $2`,
    [membershipId, streamId],
  );
}
