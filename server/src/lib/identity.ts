import { badRequest } from './errors.js';

export type Channel = 'sms' | 'email';

/** Номер в формате +7XXXXXXXXXX (Казахстан и Россия). */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  if (d.length !== 11 || !d.startsWith('7')) throw badRequest('bad_phone', 'Проверьте номер: нужен номер вида +7 777 123 45 67');
  return '+' + d;
}

export function normalizeEmail(raw: string): string {
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw badRequest('bad_email', 'Проверьте адрес почты');
  return e;
}

export function normalizeTarget(channel: Channel, raw: string): string {
  return channel === 'sms' ? normalizePhone(raw) : normalizeEmail(raw);
}
