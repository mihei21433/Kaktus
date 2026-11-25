/** Демо-данные: участница Анна с двумя неделями истории. */
import { addDays, todayKey } from '@/lib/date';
import { CONSENT_VERSION, defaultGoals, demoStream } from './mock-server';
import { AppState, Task } from './types';

export function buildDemoState(): AppState {
  const today = todayKey();
  const stream = demoStream();
  const goals = defaultGoals();
  goals[0].result = 'Снизить вес с 72 до 66 кг и спать по 7,5 часов';
  goals[0].criteria = [
    { id: 'c1', text: 'Вес 68 кг к концу месяца', done: true },
    { id: 'c2', text: 'Сон 7,5 ч — 5 ночей подряд', done: false },
    { id: 'c3', text: 'Пробежать 5 км без остановки', done: false },
  ];
  goals[1].result = 'Ужинать с семьёй без телефона 5 раз в неделю';
  goals[2].result = 'Отложить 300 000 ₸ на отпуск';
  goals[2].criteria = [
    { id: 'c4', text: 'Открыть накопительный счёт', done: true },
    { id: 'c5', text: 'Отложить первые 100 000 ₸', done: false },
  ];
  goals[3].result = 'Опубликовать 12 постов о беге';
  goals.push({
    id: 'g5',
    title: 'Выучить испанский до A2',
    color: '#9AA6B2',
    result: 'Сдать тест A2 и поговорить 10 минут без подсказок',
    hint: '',
    criteria: [],
    custom: true,
    splitWeekly: false,
  });

  const t = (id: string, goalId: string, text: string, date: string, repeatDaily = false): Task => ({
    id,
    goalId,
    text,
    date,
    repeatDaily,
    completions: {},
  });
  const tasks: Task[] = [
    t('t1', 'g1', 'Пройти 8000 шагов', addDays(today, -13), true),
    t('t2', 'g1', 'Выпить 2 литра воды', addDays(today, -13), true),
    t('t3', 'g3', 'Перевести 10 000 ₸ на накопительный счёт', today),
    t('t4', 'g4', 'Написать пост о первой пробежке', today),
    t('t5', 'g2', 'Ужин с семьёй без телефона', today),
    t('t6', 'g1', 'Утренняя пробежка 3 км', addDays(today, -1)),
    t('t7', 'g1', 'Лечь спать до 23:00', addDays(today, -1)),
    t('t8', 'g3', 'Составить бюджет на неделю', addDays(today, -1)),
    t('t9', 'g1', 'Записаться к терапевту', addDays(today, 1)),
    t('t10', 'g2', 'Позвонить маме', addDays(today, 1)),
  ];
  tasks[0].completions[today] = true;
  tasks[2].completions[today] = true;
  tasks[5].completions[addDays(today, -1)] = true;
  tasks[6].completions[addDays(today, -1)] = true;

  const steps: Record<string, number> = {};
  const statements: AppState['statements'] = {};
  const pattern = [9200, 11800, 7400, 10400, 12600, 6900, 10900, 8100, 13100, 9600, 11200, 10700, 7800];
  for (let i = 13; i >= 1; i--) {
    const d = addDays(today, -i);
    steps[d] = pattern[13 - i];
    const ratio = [1, 1, 0.5, 1, 1, 0, 1, 0.5, 1, 1, 1, 0.5, 1][13 - i];
    tasks[0].completions[d] = ratio > 0;
    tasks[1].completions[d] = ratio === 1;
    if (ratio > 0) {
      statements[d] = { text: 'Настрой на день: спокойно и по плану.', sentAt: new Date().toISOString(), kind: 'text' };
    }
  }
  steps[today] = 10100;

  return {
    demo: true,
    consent: { version: CONSENT_VERSION, acceptedAt: new Date().toISOString(), aiTransfer: false },
    membership: { status: 'approved', stream, requestedAt: new Date().toISOString(), checks: 2 },
    profile: {
      name: 'Анна',
      about: 'Маркетолог, 34 года. Хочу вернуть энергию и бегать по утрам.',
      contract: 'Я обещаю себе каждый день проходить 8000 шагов, ложиться до 23:00 и честно отмечать задачи.',
      contractAcceptedAt: new Date().toISOString(),
      completed: true,
    },
    goals,
    interim: [
      { id: 'i1', goalId: 'g1', horizon: 'week', text: 'Пробежать 15 км за неделю', target: 15, unit: 'км', progress: 9, startDate: addDays(today, -1) },
      { id: 'i2', goalId: 'g1', horizon: 'month', text: 'Минус 3 кг за месяц', target: 3, unit: 'кг', progress: 0, startDate: addDays(today, -1) },
      { id: 'i3', goalId: 'g3', horizon: 'quarter', text: 'Накопить 300 000 ₸', target: 300000, unit: '₸', progress: 0, startDate: addDays(today, -1) },
    ],
    tasks,
    statements,
    steps,
    fitness: { [today]: { squats: 45 } },
    reminders: { morning: '09:00', evening: '21:00' },
  };
}
