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
