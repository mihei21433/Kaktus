/**
 * Команды администратора (пока нет экранов модератора):
 *   npm run admin -- make-moderator +77771234567 "Марина Ковалёва"
 *   npm run admin -- create-stream +77771234567 "Поток «Весна»" [дней=90] [--no-approval]
 *   npm run admin -- streams
 *   npm run admin -- requests [код потока]
 *   npm run admin -- approve <id заявки> | reject <id заявки>
 */
import { mkdir } from 'node:fs/promises';

import { loadConfig } from './config.js';
import { migrate, openDb } from './db/index.js';
import { assertNotLocked } from './db/lock.js';
import { todayIn } from './lib/time.js';
import { decideMembership } from './routes/moderator.js';
import { createStream } from './streams.js';
import { findOrCreateUser } from './users.js';

const cfg = loadConfig();
if (!cfg.databaseUrl) {
  await mkdir(cfg.dataDir, { recursive: true });
  try {
    assertNotLocked(cfg.dataDir);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
const db = await openDb({ url: cfg.databaseUrl, dataDir: cfg.dataDir });
await migrate(db);

const [cmd, ...args] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'make-moderator': {
      const [contact, name] = args;
      if (!contact) throw new Error('Укажите телефон или e-mail');
      const id = await findOrCreateUser(db, contact);
      await db.query(`update users set is_moderator = true, name = coalesce(nullif($2, ''), name) where id = $1`, [id, name ?? '']);
      console.log(`Готово: ${contact} — модератор`);
      break;
    }
    case 'create-stream': {
      const [contact, name, days] = args.filter((a) => !a.startsWith('--'));
      if (!contact || !name) throw new Error('Пример: create-stream +77771234567 "Поток «Весна»" 90');
      const ownerId = await findOrCreateUser(db, contact);
      await db.query('update users set is_moderator = true where id = $1', [ownerId]);
      const s = await db.tx((q) =>
        createStream(q, {
          name,
          ownerId,
          startDate: todayIn('Asia/Almaty'),
          durationDays: Number(days ?? 90),
          requireApproval: !args.includes('--no-approval'),
        }),
      );
      console.log(`Поток создан. Код для участников: ${s.code}`);
      break;
    }
    case 'streams': {
      const rows = await db.query(
        `select s.code, s.name, (select count(*)::int from memberships m where m.stream_id = s.id and m.status = 'approved') as участников,
                (select count(*)::int from memberships m where m.stream_id = s.id and m.status = 'pending') as заявок
         from streams s order by s.created_at`,
      );
      console.table(rows);
      break;
    }
    case 'requests': {
      const rows = await db.query(
        `select m.id, s.code as поток, coalesce(nullif(u.name, ''), coalesce(u.phone, u.email)) as участник, m.requested_at as подана
         from memberships m join streams s on s.id = m.stream_id join users u on u.id = m.user_id
         where m.status = 'pending' and ($1::text is null or s.code = upper($1))
         order by m.requested_at`,
        [args[0] ?? null],
      );
      if (!rows.length) console.log('Новых заявок нет');
      else console.table(rows);
      break;
    }
    case 'approve':
    case 'reject': {
      if (!args[0]) throw new Error('Укажите id заявки (команда requests покажет список)');
      await db.tx((q) => decideMembership(q, args[0], cmd, null));
      console.log(cmd === 'approve' ? 'Заявка одобрена' : 'Заявка отклонена');
      break;
    }
    default:
      console.log('Команды: make-moderator, create-stream, streams, requests, approve, reject');
  }
} catch (e) {
  console.error('Ошибка:', (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
