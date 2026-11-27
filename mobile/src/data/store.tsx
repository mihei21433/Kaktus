/**
 * Состояние приложения.
 * С сервером: каждое действие сразу меняет экран (оптимистично) и уходит на сервер;
 * при ошибке показываем сообщение и перечитываем состояние с сервера.
 * Демо-режим: всё только на телефоне.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';

import { todayKey } from '@/lib/date';
import * as api from './api';
import { configureForegroundNotifications, registerForPush } from './push';
import { buildDemoState } from './demo';
import { CONSENT_VERSION } from './mock-server';
import { AppState, Criterion, Goal, Horizon, InterimGoal, MembershipStatus, Stream, Task } from './types';

const STORAGE_KEY = 'kaktus:v1';

export const initialState = (): AppState => ({
  consent: null,
  membership: { status: 'none', checks: 0 },
  profile: { name: '', about: '', contract: '', completed: false },
  goals: [],
  interim: [],
  tasks: [],
  statements: {},
  steps: {},
  fitness: {},
  reminders: { morning: '09:00', evening: '21:00' },
});

type Setter = (fn: (s: AppState) => AppState) => void;

type Env = {
  setState: Setter;
  get: () => AppState;
  setError: (m: string | null) => void;
  setLoggedIn: (v: boolean) => void;
};

function useActions({ setState, get, setError, setLoggedIn }: Env) {
  return useMemo(() => {
    const online = () => !get().demo && api.hasSession();

    async function refresh() {
      if (!api.hasSession()) return;
      try {
        const server = await api.api<AppState>('GET', '/v1/me/state');
        setState((s) => ({ ...server, consent: server.consent ?? s.consent, demo: false }));
      } catch (e) {
        if (e instanceof api.ApiError && e.status !== 401) setError(e.message);
      }
    }

    /** Отправить изменение на сервер; при ошибке — сообщение и откат через перечитывание. */
    function sync(call: () => Promise<unknown>) {
      if (!online()) return;
      call().catch((e: unknown) => {
        setError(e instanceof api.ApiError ? e.message : 'Не удалось сохранить изменения');
        void refresh();
      });
    }

    return {
      refresh,

      /* --- Вход --- */
      /** Вступление без SMS: аккаунт, заявка в поток и личный код входа. */
      async joinWithStreamCode(code: string, who: { firstName: string; lastName: string; phone: string }) {
        const r = await api.joinWithStreamCode(code, who, get().consent?.version ?? CONSENT_VERSION);
        setLoggedIn(true);
        await refresh();
        return r.loginCode;
      },
      async loginWithCode(code: string) {
        await api.loginWithCode(code);
        setLoggedIn(true);
        await refresh();
        return get();
      },
      async logout() {
        await api.logout();
        setLoggedIn(false);
        setState(() => initialState());
      },

      /* --- Согласие --- */
      acceptConsent() {
        setState((s) => ({
          ...s,
          consent: { version: CONSENT_VERSION, acceptedAt: new Date().toISOString(), aiTransfer: false },
        }));
        sync(() => api.api('POST', '/v1/me/consent', { version: CONSENT_VERSION }));
      },
      setAiTransfer(v: boolean) {
        setState((s) => (s.consent ? { ...s, consent: { ...s.consent, aiTransfer: v } } : s));
        sync(() => api.api('PUT', '/v1/me/consent', { aiTransfer: v }));
      },

      /* --- Поток --- */
      async joinByCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
        try {
          const r = await api.api<{ status: MembershipStatus; stream: Stream }>('POST', '/v1/me/join', { code });
          setState((s) => ({
            ...s,
            membership: { status: r.status, stream: r.stream, requestedAt: new Date().toISOString(), checks: 0 },
          }));
          if (r.status === 'approved') await refresh();
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof api.ApiError ? e.message : 'Не удалось отправить заявку' };
        }
      },
      async checkStatus(): Promise<MembershipStatus> {
        try {
          const r = await api.api<{ status: MembershipStatus; stream?: Stream }>('GET', '/v1/me/membership');
          if (r.status === 'approved') await refresh();
          else setState((s) => ({ ...s, membership: { ...s.membership, status: r.status, stream: r.stream ?? s.membership.stream } }));
          return r.status;
        } catch (e) {
          setError(e instanceof api.ApiError ? e.message : 'Не удалось проверить статус');
          return get().membership.status;
        }
      },
      async cancelRequest() {
        if (online()) {
          try {
            await api.api('POST', '/v1/me/join/cancel');
          } catch (e) {
            setError(e instanceof api.ApiError ? e.message : 'Не удалось отозвать заявку');
            return;
          }
        }
        setState((s) => ({ ...s, membership: { status: 'none', checks: 0 } }));
      },
      async leaveStream() {
        if (online()) {
          try {
            await api.api('POST', '/v1/me/leave');
          } catch (e) {
            setError(e instanceof api.ApiError ? e.message : 'Не удалось выйти из потока');
            return;
          }
        }
        setState((s) => (s.demo ? { ...initialState(), consent: s.consent } : { ...s, ...emptyData(), membership: { status: 'none', checks: 0 } }));
      },
      async deleteAccount(): Promise<boolean> {
        if (online()) {
          try {
            await api.api('DELETE', '/v1/me');
          } catch (e) {
            setError(e instanceof api.ApiError ? e.message : 'Не удалось удалить аккаунт');
            return false;
          }
          await api.logout();
          setLoggedIn(false);
        }
        setState(() => initialState());
        return true;
      },
      loadDemo() {
        setState(() => buildDemoState());
      },

      /* --- Профиль --- */
      saveProfile(p: { name?: string; phone?: string; about: string; contract: string; accepted: boolean }) {
        setState((s) => ({
          ...s,
          profile: {
            name: p.name ?? s.profile.name,
            phone: p.phone ?? s.profile.phone,
            about: p.about,
            contract: s.profile.contractAcceptedAt ? s.profile.contract : p.contract,
            contractAcceptedAt: p.accepted ? s.profile.contractAcceptedAt ?? new Date().toISOString() : s.profile.contractAcceptedAt,
            completed: true,
          },
        }));
        sync(() => api.api('PUT', '/v1/me/profile', p));
      },
      skipProfile() {
        setState((s) => ({ ...s, profile: { ...s.profile, completed: true } }));
        sync(() => api.api('POST', '/v1/me/profile/skip'));
      },

      /* --- Задачи --- */
      toggleTask(id: string, date: string) {
        const done = !get().tasks.find((t) => t.id === id)?.completions[date];
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, completions: { ...t.completions, [date]: done } } : t)),
        }));
        sync(() => api.api('PUT', `/v1/me/tasks/${id}/completions/${date}`, { done }));
      },
      addTask(t: Omit<Task, 'id' | 'completions'>) {
        const task: Task = { ...t, id: api.uuid(), completions: {} };
        setState((s) => ({ ...s, tasks: [...s.tasks, task] }));
        sync(() =>
          api.api('POST', '/v1/me/tasks', {
            id: task.id,
            goalId: task.goalId,
            text: task.text,
            date: task.date,
            repeatDaily: task.repeatDaily,
            minValue: task.minValue,
            unit: task.unit,
          }),
        );
      },
      deleteTask(id: string) {
        setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id || t.fromModerator) }));
        sync(() => api.api('DELETE', `/v1/me/tasks/${id}`));
      },

      /* --- Заявление --- */
      sendStatement(text: string) {
        const date = todayKey();
        setState((s) => ({
          ...s,
          statements: { ...s.statements, [date]: { text, sentAt: new Date().toISOString(), kind: 'text' } },
        }));
        sync(() => api.api('PUT', `/v1/me/statements/${date}`, { text }));
      },
      /** Голосовое заявление: файл с телефона уходит на сервер (в демо — остаётся на телефоне). */
      async sendVoice(uri: string, durationSec: number, mimeType: string): Promise<boolean> {
        const date = todayKey();
        const sentAt = new Date().toISOString();
        if (!online()) {
          setState((s) => ({ ...s, statements: { ...s.statements, [date]: { text: '', kind: 'voice', sentAt, durationSec, localUri: uri } } }));
          return true;
        }
        try {
          const blob = await (await fetch(uri)).blob();
          await api.upload(`/v1/me/statements/${date}/voice?duration=${durationSec}`, blob, mimeType);
          setState((s) => ({ ...s, statements: { ...s.statements, [date]: { text: '', kind: 'voice', sentAt, durationSec } } }));
          return true;
        } catch (e) {
          setError(e instanceof api.ApiError ? e.message : 'Не удалось отправить запись');
          return false;
        }
      },
      clearStatement() {
        const date = todayKey();
        setState((s) => {
          const statements = { ...s.statements };
          delete statements[date];
          return { ...s, statements };
        });
        sync(() => api.api('DELETE', `/v1/me/statements/${date}`));
      },

      /* --- Шаги и нормативы --- */
      setSteps(count: number) {
        const date = todayKey();
        setState((s) => ({ ...s, steps: { ...s.steps, [date]: count } }));
        sync(() => api.api('PUT', `/v1/me/steps/${date}`, { count }));
      },
      setFitness(normId: string, value: number) {
        const d = todayKey();
        setState((s) => ({ ...s, fitness: { ...s.fitness, [d]: { ...s.fitness[d], [normId]: value } } }));
        sync(() => api.api('PUT', `/v1/me/fitness/${d}/${normId}`, { value }));
      },

      /* --- Цели --- */
      saveGoal(id: string, patch: Partial<Pick<Goal, 'result' | 'criteria' | 'splitWeekly' | 'title'>>) {
        setState((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
        sync(() => api.api('PUT', `/v1/me/goals/${id}`, patch));
      },
      createGoal(title: string, result: string) {
        const id = api.uuid();
        setState((s) => ({
          ...s,
          goals: [...s.goals, { id, title, result, color: '#9AA6B2', hint: '', criteria: [], custom: true, splitWeekly: false }],
        }));
        sync(() => api.api('POST', '/v1/me/goals', { id, title, result }));
        return id;
      },
      addInterim(g: { goalId: string; horizon: Horizon; text: string; target?: number; unit?: string }) {
        const id = api.uuid();
        setState((s) => ({ ...s, interim: [...s.interim, { ...g, id, progress: 0, startDate: todayKey() }] }));
        sync(() => api.api('POST', '/v1/me/interim', { id, ...g }));
      },
      setInterimProgress(id: string, progress: number) {
        const value = Math.max(0, progress);
        setState((s) => ({ ...s, interim: s.interim.map((i) => (i.id === id ? { ...i, progress: value } : i)) }));
        sync(() => api.api('PUT', `/v1/me/interim/${id}`, { progress: value }));
      },
    };
  }, [setState, get, setError, setLoggedIn]);
}

function emptyData(): Pick<AppState, 'goals' | 'interim' | 'tasks' | 'statements' | 'steps' | 'fitness'> {
  return { goals: [], interim: [], tasks: [], statements: {}, steps: {}, fitness: {} };
}

export type Actions = ReturnType<typeof useActions>;

type Ctx = {
  state: AppState;
  actions: Actions;
  hydrated: boolean;
  loggedIn: boolean;
  error: string | null;
  clearError: () => void;
  showError: (message: string) => void;
};
const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setRaw] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(state);
  useEffect(() => {
    ref.current = state;
  }, [state]);

  const setState = useCallback<Setter>(
    (fn) =>
      setRaw((s) => {
        const next = fn(s);
        ref.current = next;
        return next;
      }),
    [],
  );
  const get = useCallback(() => ref.current, []);
  const actions = useActions({ setState, get, setError, setLoggedIn });

  // Загрузка: кэш с телефона, затем свежие данные с сервера
  useEffect(() => {
    api.onSessionExpired(() => {
      setLoggedIn(false);
      setState((s) => ({ ...initialState(), consent: s.consent }));
      setError('Сессия устарела. Войдите заново');
    });
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState(() => ({ ...initialState(), ...JSON.parse(raw) }));
      } catch {}
      const session = await api.initSession();
      setLoggedIn(!!session);
      setHydrated(true);
      if (session && !ref.current.demo) await actions.refresh();
    })();
  }, [actions, setState]);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  // Пуш-уведомления: показ при открытом приложении и регистрация после входа
  // (нажатие на уведомление обрабатывает NotificationRouter)
  useEffect(() => {
    configureForegroundNotifications();
  }, []);
  useEffect(() => {
    if (loggedIn && hydrated) void registerForPush();
  }, [loggedIn, hydrated]);

  // Возврат в приложение — подтягиваем изменения (одобрение заявки, задачи от модератора)
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active' && api.hasSession() && !ref.current.demo) void actions.refresh();
    });
    return () => sub.remove();
  }, [actions]);

  const clearError = useCallback(() => setError(null), []);
  const showError = useCallback((m: string) => setError(m), []);
  const value = useMemo(
    () => ({ state, actions, hydrated, loggedIn, error, clearError, showError }),
    [state, actions, hydrated, loggedIn, error, clearError, showError],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp вне AppProvider');
  return ctx;
}

/* ---------- Селекторы ---------- */

export function tasksForDate(tasks: Task[], date: string): Task[] {
  return tasks.filter((t) => (t.repeatDaily ? t.date <= date : t.date === date));
}

export function goalProgress(g: Goal): number {
  if (!g.criteria.length) return 0;
  return g.criteria.filter((c: Criterion) => c.done).length / g.criteria.length;
}

export function interimLabel(i: InterimGoal): string {
  return i.target ? `${i.progress}/${i.target}` : `${i.progress}`;
}
