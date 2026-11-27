/** Срок цели: базовый (day, week, month, quarter) или свой срок потока (h_…). */
export type Horizon = string;
export type StreamHorizon = { id: string; name: string; days: number; base?: boolean; enabled: boolean };

export const DEFAULT_HORIZONS: StreamHorizon[] = [
  { id: 'day', name: 'День', days: 1, base: true, enabled: true },
  { id: 'week', name: 'Неделя', days: 7, base: true, enabled: true },
  { id: 'month', name: '1 месяц', days: 30, base: true, enabled: true },
  { id: 'quarter', name: '3 месяца', days: 90, base: true, enabled: true },
];

/** Сроки потока; у старых данных без настроек — базовые. */
export function streamHorizons(s?: { horizons?: StreamHorizon[] } | null): StreamHorizon[] {
  return s?.horizons?.length ? s.horizons : DEFAULT_HORIZONS;
}

export type Reminders = { enabled?: boolean; morning: string; evening: string };

export type FitnessNorm = { id: string; name: string; unit: string; norm: number };

export type Stream = {
  id: string;
  name: string;
  code: string;
  moderator: string;
  startDate: string;
  durationDays: number;
  goalDeadline: string;
  stepsThreshold: number;
  norms: FitnessNorm[];
  horizons?: StreamHorizon[];
  /** Разделы, включённые модератором */
  modules: { statements: boolean; steps: boolean; analyses: boolean; goals: boolean; ai: boolean };
  reminders?: Reminders;
};

export type MembershipStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'blocked';

export type Membership = {
  status: MembershipStatus;
  stream?: Stream;
  requestedAt?: string;
  checks: number;
};

export type Consent = { version: string; acceptedAt: string; aiTransfer: boolean };

export type Profile = {
  name: string;
  firstName?: string;
  lastName?: string;
  /** Телефон для связи (указан при регистрации, без подтверждения) */
  phone?: string;
  /** Фото профиля: путь на сервере, /v1/files/avatar/… */
  avatarUrl?: string | null;
  about: string;
  contract: string;
  contractAcceptedAt?: string;
  completed: boolean;
};

export type Criterion = { id: string; text: string; done: boolean };

export type Goal = {
  id: string;
  title: string;
  color: string;
  /** Что хочу получить — слова участника */
  result: string;
  hint: string;
  criteria: Criterion[];
  custom: boolean;
  splitWeekly: boolean;
};

export type InterimGoal = {
  id: string;
  goalId: string;
  horizon: Horizon;
  text: string;
  target?: number;
  unit?: string;
  progress: number;
  startDate: string;
};

export type Task = {
  id: string;
  goalId: string;
  text: string;
  /** Дата задачи (для повторяющихся — первая дата) */
  date: string;
  repeatDaily: boolean;
  minValue?: number;
  unit?: string;
  fromModerator?: boolean;
  /** Комментарий модератора к задаче */
  comment?: string;
  completions: Record<string, boolean>;
};

export type Statement = {
  text: string;
  sentAt: string;
  kind: 'text' | 'voice';
  durationSec?: number;
  /** Только в демо-режиме: запись лежит на телефоне */
  localUri?: string;
};

export type Account = { phone: string | null; email: string | null; isModerator: boolean; loginCodeSetAt?: string | null };

export type AppState = {
  /** Демо-режим: всё хранится только на телефоне, сервер не используется. */
  demo?: boolean;
  account?: Account;
  consent: Consent | null;
  membership: Membership;
  profile: Profile;
  goals: Goal[];
  interim: InterimGoal[];
  tasks: Task[];
  statements: Record<string, Statement>;
  steps: Record<string, number>;
  fitness: Record<string, Record<string, number>>;
  reminders: Reminders;
  /** Короткая сводка анализов с сервера: открытый замер и последний индекс */
  analyses?: AnalysesSummary | null;
};

export type AnalysesSummary = {
  current: { id: string; name: string; deadline: string; submitted: boolean } | null;
  index: number | null;
  targetIndex: number;
};
