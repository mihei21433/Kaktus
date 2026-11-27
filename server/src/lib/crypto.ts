import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const otpCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const randomToken = () => randomBytes(32).toString('base64url');

/** Код потока: 6 латинских букв без похожих (I, O). */
export function streamCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 6 }, () => abc[randomInt(0, abc.length)]).join('');
}

/** Личный код входа: 10 знаков без похожих (0/O, 1/I/L), вид «K7F3Q-9QX2M». */
const LOGIN_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function loginCode(): string {
  const raw = Array.from({ length: 10 }, () => LOGIN_ABC[randomInt(0, LOGIN_ABC.length)]).join('');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Русские буквы, похожие на латинские (набрано на русской раскладке): А→A, В→B, Е→E… */
const CYR: Record<string, string> = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' };

/** Нормализация введённого кода: регистр, русские двойники, без пробелов и дефисов. */
export function normalizeCode(raw: string): string {
  return [...raw.toUpperCase()].map((c) => CYR[c] ?? c).join('').replace(/[^A-Z0-9]/g, '');
}
