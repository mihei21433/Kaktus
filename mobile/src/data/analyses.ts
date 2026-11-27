/** Анализы: типы ответов сервера, подписи статусов, загрузка бланков. */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

import { colors } from '@/theme';
import { api, API_URL, ApiError, upload } from './api';

export type Range = { lo?: number; hi?: number };
export type Status = 'normal' | 'border' | 'low' | 'high' | 'unknown';
export type CatalogItem = { id: string; group: string; name: string; unit: string; norm: Range | null; normLabel: string };
export type Measurement = {
  id: string;
  name: string;
  opensOn: string;
  deadline: string;
  open: boolean;
  submittedAt: string | null;
  blanks: { id: string; fileName: string; mime: string; size: number; createdAt: string }[];
  values: Record<string, { value: number; comparator: '=' | '<' | '>'; status: Status }>;
  summary: { filled: number; normal: number; border: number; deviation: number; unknown: number; total: number };
  index: { total: number; analyses: number | null; fitness: number | null; regularity: number } | null;
};
export type Analyses = {
  sex: 'female' | 'male' | null;
  groups: string[];
  catalog: CatalogItem[];
  targetIndex: number;
  weights: { analyses: number; fitness: number; regularity: number };
  measurements: Measurement[];
  currentId: string | null;
};

export const STATUS_LABEL: Record<Status, string> = {
  normal: 'В норме',
  border: 'У границы',
  low: 'Ниже нормы',
  high: 'Выше нормы',
  unknown: 'Оценивает модератор',
};
export const STATUS_COLOR: Record<Status, string> = {
  normal: colors.green,
  border: colors.orange,
  low: colors.red,
  high: colors.red,
  unknown: colors.textSecondary,
};

/** «5,4» — десятичная запятая, как в бланках */
export const fmt = (v: number) => String(v).replace('.', ',');
export const unitOf = (c: CatalogItem) => `норма ${c.normLabel}${c.norm ? `, ${c.unit}` : ''}`;

/** Последний замер с введёнными значениями (для «Моих анализов»). */
export function latestWithValues(a: Analyses): Measurement | null {
  return [...a.measurements].reverse().find((m) => m.summary.filled > 0) ?? null;
}

type Picked = { uri: string; name: string; mime: string };

/** Фото бланка камерой. null — человек передумал или не дал доступ. */
export async function pickFromCamera(): Promise<Picked | null | 'denied'> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return 'denied';
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.fileName ?? 'бланк.jpg', mime: a.mimeType ?? 'image/jpeg' };
}

/** Фото или PDF из файлов телефона. */
export async function pickFromFiles(): Promise<Picked | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.name, mime: a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg') };
}

export async function uploadBlank(measurementId: string, f: Picked) {
  const blob = await (await fetch(f.uri)).blob();
  await upload(`/v1/me/measurements/${measurementId}/blanks`, blob, f.mime, {
    method: 'POST',
    headers: { 'X-File-Name': encodeURIComponent(f.name) },
  });
}

/** Значение, найденное на бланке. Сервер его не сохраняет — участник проверяет и сохраняет сам. */
export type RecognizedValue = {
  indicatorId: string;
  name: string;
  unit: string;
  value: number;
  comparator: '=' | '<' | '>';
  line: string;
  check: boolean;
  note?: string;
  current: { value: number; comparator: string } | null;
};
export type Recognition = {
  found: RecognizedValue[];
  blanks: { id: string; fileName: string; found: number; error?: string }[];
  total: number;
};

export const recognizeBlanks = (mid: string) => api<Recognition>('POST', `/v1/me/measurements/${mid}/recognize`);

export const saveValues = (mid: string, values: { indicatorId: string; value: number; comparator: string }[]) =>
  api('PUT', `/v1/me/measurements/${mid}/values`, { values });

/** Шаги со скриншота шагомера: картинка не сохраняется. */
export async function recognizeSteps(): Promise<{ steps: number | null; candidates: number[] } | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const blob = await (await fetch(a.uri)).blob();
  const type = a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  return upload('/v1/me/steps/recognize', blob, type, { method: 'POST' });
}

/** Открыть бланк: сервер выдаёт ссылку на 10 минут, телефон показывает файл. */
export async function openBlank(linkPath: string) {
  const { url } = await api<{ url: string }>('GET', linkPath);
  if (Platform.OS === 'web') window.open(API_URL + url, '_blank');
  else await Linking.openURL(API_URL + url);
}

export function errorText(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}
