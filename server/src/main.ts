import { mkdir } from 'node:fs/promises';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate, openDb } from './db/index.js';
import { assertNotLocked, holdLock } from './db/lock.js';
import { createPush } from './push.js';
import { runReminders } from './reminders.js';

const cfg = loadConfig();
if (!cfg.databaseUrl) {
  await mkdir(cfg.dataDir, { recursive: true });
  assertNotLocked(cfg.dataDir);
  holdLock(cfg.dataDir);
}
const db = await openDb({ url: cfg.databaseUrl, dataDir: cfg.dataDir });
const app = await buildApp(db, cfg);

await migrate(db, (m) => app.log.info(m));
app.log.info(
  `База: ${db.kind === 'pglite' ? `встроенная (${cfg.dataDir})` : 'PostgreSQL'}; SMS: ${cfg.sms.provider}; почта: ${cfg.email.provider}` +
    (cfg.devReturnCodes ? '; коды входа возвращаются в ответе (тестовый режим)' : ''),
);

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: cfg.port, host: cfg.host });

// Напоминания: проверка раз в минуту
const push = createPush(db, cfg, app.log);
const tick = () =>
  runReminders(db, push)
    .then((n) => n && app.log.info(`напоминаний отправлено: ${n}`))
    .catch((e) => app.log.error(e, 'ошибка напоминаний'));
setInterval(tick, 60_000);
void tick();
