import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { todayKey } from '@/lib/date';
import * as server from './mock-server';
import { buildDemoState } from './demo';
import { AppState, Criterion, Goal, Horizon, InterimGoal, Task } from './types';

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

const uid = () => Math.random().toString(36).slice(2, 10);

function useActions(setState: (fn: (s: AppState) => AppState) => void, get: () => AppState) {
  return useMemo(
    () => ({
      /* --- Согласие --- */
      acceptConsent() {
        setState((s) => ({
          ...s,
          consent: { version: server.CONSENT_VERSION, acceptedAt: new Date().toISOString(), aiTransfer: false },
        }));
      },
      setAiTransfer(v: boolean) {
        setState((s) => (s.consent ? { ...s, consent: { ...s.consent, aiTransfer: v } } : s));
      },

      /* --- Вступление в поток --- */
      async joinByCode(code: string) {
        const res = await server.requestJoin(code);
        if (res.ok) {
          setState((s) => ({
            ...s,
            membership: { status: 'pending', stream: res.stream, requestedAt: new Date().toISOString(), checks: 0 },
          }));
        }
        return res;
      },
      async checkStatus() {
        const m = get().membership;
        if (!m.stream) return 'none' as const;
        const status = await server.checkStatus(m.stream.code, m.checks);
        setState((s) => ({
          ...s,
          membership: { ...s.membership, status, checks: s.membership.checks + 1 },
          goals: status === 'approved' && s.goals.length === 0 ? server.defaultGoals() : s.goals,
          profile: status === 'approved' && !s.profile.name ? { ...s.profile, name: 'Алексей' } : s.profile,
        }));
        return status;
      },
      cancelRequest() {
        setState((s) => ({ ...s, membership: { status: 'none', checks: 0 } }));
      },
      leaveStream() {
        setState((s) => ({ ...initialState(), consent: s.consent }));
      },
      deleteAccount() {
        setState(() => initialState());
      },
      loadDemo() {
        setState(() => buildDemoState());
      },

      /* --- Профиль --- */
      saveProfile(p: { name?: string; about: string; contract: string; accepted: boolean }) {
        setState((s) => ({
          ...s,
          profile: {
            name: p.name ?? s.profile.name,
            about: p.about,
            contract: p.contract,
            contractAcceptedAt: p.accepted ? s.profile.contractAcceptedAt ?? new Date().toISOString() : undefined,
            completed: true,
          },
        }));
      },
      skipProfile() {
        setState((s) => ({ ...s, profile: { ...s.profile, completed: true } }));
      },

      /* --- Задачи --- */
      toggleTask(id: string, date: string) {
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completions: { ...t.completions, [date]: !t.completions[date] } } : t,
          ),
        }));
      },
      addTask(t: Omit<Task, 'id' | 'completions'>) {
        setState((s) => ({ ...s, tasks: [...s.tasks, { ...t, id: uid(), completions: {} }] }));
      },
      deleteTask(id: string) {
        setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id || t.fromModerator) }));
      },

      /* --- Заявление --- */
      sendStatement(text: string) {
        setState((s) => ({
          ...s,
          statements: { ...s.statements, [todayKey()]: { text, sentAt: new Date().toISOString(), kind: 'text' } },
        }));
      },
      clearStatement() {
        setState((s) => {
          const statements = { ...s.statements };
          delete statements[todayKey()];
          return { ...s, statements };
        });
      },

      /* --- Шаги и нормативы --- */
      setSteps(count: number) {
        setState((s) => ({ ...s, steps: { ...s.steps, [todayKey()]: count } }));
      },
      setFitness(normId: string, value: number) {
        const d = todayKey();
        setState((s) => ({ ...s, fitness: { ...s.fitness, [d]: { ...s.fitness[d], [normId]: value } } }));
      },

      /* --- Цели --- */
      saveGoal(id: string, patch: Partial<Pick<Goal, 'result' | 'criteria' | 'splitWeekly' | 'title'>>) {
        setState((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
      },
      createGoal(title: string, result: string) {
        const id = uid();
        setState((s) => ({
          ...s,
          goals: [
            ...s.goals,
            { id, title, result, color: '#9AA6B2', hint: '', criteria: [], custom: true, splitWeekly: false },
          ],
        }));
        return id;
      },
      addInterim(g: { goalId: string; horizon: Horizon; text: string; target?: number; unit?: string }) {
        setState((s) => ({
          ...s,
          interim: [...s.interim, { ...g, id: uid(), progress: 0, startDate: todayKey() }],
        }));
      },
      setInterimProgress(id: string, progress: number) {
        setState((s) => ({
          ...s,
          interim: s.interim.map((i) => (i.id === id ? { ...i, progress: Math.max(0, progress) } : i)),
        }));
      },
    }),
    [setState, get],
  );
}

export type Actions = ReturnType<typeof useActions>;

type Ctx = { state: AppState; actions: Actions; hydrated: boolean };
const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setRaw] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const ref = useRef(state);
  useEffect(() => {
    ref.current = state;
  }, [state]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setRaw({ ...initialState(), ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  const setState = useCallback((fn: (s: AppState) => AppState) => setRaw((s) => fn(s)), []);
  const get = useCallback(() => ref.current, []);
  const actions = useActions(setState, get);

  const value = useMemo(() => ({ state, actions, hydrated }), [state, actions, hydrated]);
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
