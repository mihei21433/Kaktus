/** Пользователи по контакту: телефон или почта. */
import type { Queryable } from './db/index.js';
import { normalizeEmail, normalizePhone } from './lib/identity.js';

/** Нормализует телефон или почту; бросает понятную ошибку, если контакт не похож ни на то, ни на другое. */
export function parseContact(raw: string): { col: 'phone' | 'email'; value: string } {
  const s = raw.trim();
  return s.includes('@') ? { col: 'email', value: normalizeEmail(s) } : { col: 'phone', value: normalizePhone(s) };
}

/** Находит пользователя по контакту или заводит нового: войдёт он потом по этому же номеру или почте. */
export async function findOrCreateUser(q: Queryable, contact: string): Promise<string> {
  const { col, value } = parseContact(contact);
  const [u] = await q.query<{ id: string }>(`select id from users where ${col} = $1`, [value]);
  if (u) return u.id;
  const [n] = await q.query<{ id: string }>(`insert into users (${col}) values ($1) returning id`, [value]);
  return n.id;
}
