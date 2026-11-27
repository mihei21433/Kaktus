/** Имя человека: «Имя Фамилия» для показа, ссылка на фото профиля. */
export function splitName(full: string): { first: string; last: string } {
  const t = full.trim().replace(/\s+/g, ' ');
  const i = t.lastIndexOf(' ');
  return i > 0 ? { first: t.slice(0, i), last: t.slice(i + 1) } : { first: t, last: '' };
}

export const fullName = (first: string, last: string) => `${first.trim()} ${last.trim()}`.trim();

/** Публичная ссылка на фото: имя файла — 32 случайных символа, поэтому её нельзя подобрать. */
export const avatarUrl = (rel: string | null | undefined) => (rel ? `/v1/files/avatar/${rel.split('/').pop()}` : null);
