/** Данные кабинета модератора: типы ответов сервера и загрузчик с обновлением при возврате на экран. */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api, ApiError } from './api';
import { Stream } from './types';

export type MemberLabel = 'new' | 'on_plan' | 'behind' | 'no_reports';

export type StreamSummary = Stream & {
  requireApproval: boolean;
  members: number;
  pending: number;
  counts: Record<MemberLabel, number>;
};

export type Overview = { streams: StreamSummary[]; totals: { members: number; attention: number } };

export type RequestItem = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  name: string;
  contact: string | null;
  streamName: string;
  streamCode: string;
  requestedAt: string;
  decidedAt: string | null;
};

export type MemberRow = {
  id: string;
  name: string;
  blocked: boolean;
  label: MemberLabel;
  today: { done: number; total: number; steps: number | null; statement: boolean };
  taskRate: number | null;
  lastActivity: string | null;
  stepsBelow: number;
};

export type DayView = {
  date: string;
  tasks: { id: string; text: string; done: boolean; fromModerator: boolean; doneAt?: string }[];
  steps: number | null;
  statement: { text: string; sentAt: string } | null;
};

export type Dossier = {
  member: { id: string; name: string; contact: string | null; about: string; contract: string; blocked: boolean; status: string };
  stream: { id: string; name: string; stepsThreshold: number; modules: Stream['modules'] };
  stats: {
    label: MemberLabel;
    dayInStream: number;
    taskRate: number | null;
    avgSteps: number | null;
    stepsBelow: number;
    statementsSent: number;
    statementDays: number;
    overdue: number;
    streak: number;
    lastActivity: string | null;
  };
  days: DayView[];
  goals: { id: string; title: string; color: string; result: string; custom: boolean; progress: number }[];
  interim: { id: string; goalId: string; horizon: string; text: string; target: number | null; unit: string | null; progress: number }[];
};

export type Broadcast = { id: string; text: string; recipients: number; createdAt: string };

/** Загружает данные при каждом показе экрана; reload — для ручного обновления после действий. */
export function useQuery<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>('GET', path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, error, loading, reload };
}

export const LABELS: Record<MemberLabel, string> = {
  on_plan: 'По плану',
  behind: 'Отстаёт',
  no_reports: 'Без отправок',
  new: 'Новый',
};

/** «5 мин назад», «3 ч назад», «2 дн. назад» */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return `${Math.floor(s / 86400)} дн. назад`;
}
