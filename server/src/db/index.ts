/**
 * Единый интерфейс к базе: настоящий PostgreSQL (DATABASE_URL) на сервере
 * или встроенный PGlite (файл в ./data) для локального запуска без установки БД.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: 'postgres' | 'pglite';
}

export async function openDb(opts: { url?: string; dataDir?: string }): Promise<Db> {
  if (opts.url) {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: opts.url, max: 10 });
    return {
      kind: 'postgres',
      async query(sql, params) {
        return (await pool.query(sql, params as unknown[])).rows;
      },
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const res = await fn({ query: async (s, p) => (await client.query(s, p as unknown[])).rows });
          await client.query('commit');
          return res;
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create(opts.dataDir);
  return {
    kind: 'pglite',
    async query(sql, params) {
      return (await db.query(sql, params as unknown[])).rows as never;
    },
    async tx(fn) {
      return db.transaction((t) => fn({ query: async (s, p) => (await t.query(s, p as unknown[])).rows as never }));
    },
    close: () => db.close(),
  };
}

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Применяет SQL-файлы из migrations/ по порядку, каждый один раз. */
export async function migrate(db: Db, log: (m: string) => void = () => {}) {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
    await db.tx(async (q) => {
      for (const stmt of splitSql(sql)) await q.query(stmt);
      await q.query('insert into schema_migrations(name) values ($1)', [f]);
    });
    log(`migration applied: ${f}`);
  }
}

function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}
