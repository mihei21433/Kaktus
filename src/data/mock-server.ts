/**
 * Имитация сервера на этапе 1. Позже эти функции заменятся
 * HTTP-запросами к бэкенду с теми же сигнатурами.
 */
import { addDays, todayKey } from '@/lib/date';
import { Goal, MembershipStatus, Stream } from './types';
import { goalPalette } from '@/theme';

export const CONSENT_VERSION = '2026-11-01';

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function makeStream(name: string, code: string): Stream {
  return {
    id: code.toLowerCase(),
    name,
    code,
    moderator: 'Марина Ковалёва',
    startDate: addDays(todayKey(), -14),
    durationDays: 90,
    goalDeadline: '16 января',
    stepsThreshold: 10000,
    norms: [
      { id: 'plank', name: 'Планка', unit: 'сек', norm: 90 },
      { id: 'squats', name: 'Приседания', unit: 'раз', norm: 50 },
    ],
    modules: { statements: true, steps: true, analyses: true, goals: true, ai: false },
  };
}

const STREAMS: Record<string, { stream: Stream; outcome: MembershipStatus }> = {
  VPNWTM: { stream: makeStream('Поток «Весна»', 'VPNWTM'), outcome: 'approved' },
  OTKAZZ: { stream: makeStream('Поток «Осень»', 'OTKAZZ'), outcome: 'rejected' },
};

export type JoinResult = { ok: true; stream: Stream } | { ok: false; error: string };

export async function requestJoin(code: string): Promise<JoinResult> {
  await delay();
  const entry = STREAMS[code.toUpperCase()];
  if (!entry) return { ok: false, error: 'Такого кода нет. Проверьте буквы или спросите код у модератора' };
  return { ok: true, stream: entry.stream };
}

/** Модератор «решает» заявку со второй проверки статуса. */
export async function checkStatus(code: string, checks: number): Promise<MembershipStatus> {
  await delay();
  const entry = STREAMS[code.toUpperCase()];
  if (!entry) return 'rejected';
  return checks >= 1 ? entry.outcome : 'pending';
}

export function defaultGoals(): Goal[] {
  const base: [string, string][] = [
    ['Здоровье', 'Формулируйте измеримо: вес, показатели, сон'],
    ['Отношения', 'Что именно должно измениться в отношениях'],
    ['Финансы', 'Конкретная сумма или финансовая привычка'],
    ['Личный бренд', 'Охват, публикации, выступления'],
  ];
  return base.map(([title, hint], i) => ({
    id: `g${i + 1}`,
    title,
    color: goalPalette[i],
    result: '',
    hint,
    criteria: [],
    custom: false,
    splitWeekly: false,
  }));
}

/** Для демо-режима: поток без задержки. */
export function requestJoinSync(code: string): Stream {
  return STREAMS[code].stream;
}
