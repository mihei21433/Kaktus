/** Данные для демо-режима (без сервера). */
import { addDays, todayKey } from '@/lib/date';
import { goalPalette } from '@/theme';
import { Goal, Stream } from './types';

export const CONSENT_VERSION = '2026-11-01';

export function demoStream(): Stream {
  return {
    id: 'demo',
    name: 'Поток «Весна»',
    code: 'VPNWTM',
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
