export type Horizon = 'day' | 'week' | 'month' | 'quarter';

export const HORIZONS: { value: Horizon; label: string; days: number }[] = [
  { value: 'day', label: 'День', days: 1 },
  { value: 'week', label: 'Неделя', days: 7 },
  { value: 'month', label: '1 месяц', days: 30 },
  { value: 'quarter', label: '3 месяца', days: 90 },
];

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
  /** Разделы, включённые модератором */
  modules: { statements: boolean; steps: boolean; analyses: boolean; goals: boolean; ai: boolean };
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
  completions: Record<string, boolean>;
};

export type Statement = { text: string; sentAt: string; kind: 'text' | 'voice' };

export type AppState = {
  consent: Consent | null;
  membership: Membership;
  profile: Profile;
  goals: Goal[];
  interim: InterimGoal[];
  tasks: Task[];
  statements: Record<string, Statement>;
  steps: Record<string, number>;
  fitness: Record<string, Record<string, number>>;
  reminders: { morning: string; evening: string };
};
