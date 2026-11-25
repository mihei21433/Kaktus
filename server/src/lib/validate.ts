import { z } from 'zod';

import { badRequest } from './errors.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw badRequest('validation', `Неверные данные: ${issue.path.join('.') || 'запрос'} — ${issue.message}`);
  }
  return r.data;
}

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'дата в формате ГГГГ-ММ-ДД');
export const zId = z.uuid();
export const zText = (max: number) => z.string().trim().max(max);
