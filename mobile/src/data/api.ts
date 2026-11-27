/**
 * Клиент сервера «Кактуса».
 * Адрес: EXPO_PUBLIC_API_URL, а при разработке — тот же компьютер, с которого Expo
 * загрузил приложение (порт 3000), чтобы ничего не настраивать вручную.
 */
import Constants from 'expo-constants';

import { loadSession, saveSession, Session } from './session';

/** Боевой сервер. Обновления «по воздуху» не получают переменных сборки, поэтому адрес записан здесь. */
const PROD_API_URL = 'https://api.vectorfamily.kz';

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (__DEV__) {
    // Разработка: сервер на том же компьютере, откуда Expo загрузил приложение
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    if (host && !host.endsWith('exp.direct')) return `http://${host}:3000`;
    return 'http://localhost:3000';
  }
  return PROD_API_URL;
}

export const API_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let session: Session | null = null;
let onExpired: () => void = () => {};
let refreshing: Promise<boolean> | null = null;

export async function initSession(): Promise<Session | null> {
  session = await loadSession();
  return session;
}
export const hasSession = () => !!session;
export function setSession(s: Session | null) {
  session = s;
  void saveSession(s);
}
export function onSessionExpired(fn: () => void) {
  onExpired = fn;
}

async function raw(method: string, path: string, body?: unknown, token?: string) {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'error', json.message ?? 'Ошибка сервера');
  return json;
}

async function tryRefresh(): Promise<boolean> {
  if (!session) return false;
  refreshing ??= raw('POST', '/v1/auth/refresh', { refreshToken: session.refreshToken })
    .then((t) => {
      setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken });
      return true;
    })
    .catch((e) => {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        onExpired();
      }
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Запрос от имени пользователя; при устаревшем токене один раз обновляет его. */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  if (!session) throw new ApiError(401, 'unauthorized', 'Нужно войти');
  try {
    return await raw(method, path, body, session.accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await tryRefresh())) {
      return raw(method, path, body, session!.accessToken);
    }
    throw e;
  }
}

/** Действующий токен доступа: обновляет его заранее, если до конца меньше минуты (нужно плееру аудио). */
export async function freshAccessToken(): Promise<string | null> {
  if (!session) return null;
  try {
    const payload = JSON.parse(atob(session.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp === 'number' && payload.exp * 1000 - Date.now() < 60_000) await tryRefresh();
  } catch {
    // токен нечитаем — сервер всё равно проверит и попросит войти заново
  }
  return session?.accessToken ?? null;
}

/** Загрузка файла «как есть» (аудио). */
export async function upload<T = unknown>(path: string, body: Blob, contentType: string, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<T> {
  const send = async () => {
    const token = await freshAccessToken();
    let res: Response;
    try {
      res = await fetch(API_URL + path, {
        method: opts.method ?? 'PUT',
        headers: { 'Content-Type': contentType, Authorization: `Bearer ${token}`, ...opts.headers },
        body,
      });
    } catch {
      throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, json.error ?? 'error', json.message ?? 'Ошибка сервера');
    return json as T;
  };
  try {
    return await send();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await tryRefresh())) return send();
    throw e;
  }
}

/* --- Вход --- */

/** Новый участник без SMS: код потока + имя. Возвращает личный код входа — показать один раз. */
export async function joinWithStreamCode(streamCode: string, name: string, consentVersion: string) {
  const t = await raw('POST', '/v1/auth/join', { streamCode, name, consentVersion });
  setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken });
  return t as { loginCode: string; membership: string };
}

/** Вход по личному коду входа. */
export async function loginWithCode(code: string) {
  const t = await raw('POST', '/v1/auth/code-login', { code });
  setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken });
}

export async function logout() {
  const s = session;
  setSession(null);
  if (s) await raw('POST', '/v1/auth/logout', { refreshToken: s.refreshToken }).catch(() => {});
}

/** UUID v4 для новых записей — сервер принимает идентификаторы от приложения. */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
