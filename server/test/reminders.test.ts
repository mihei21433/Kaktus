/** Напоминания: кому и когда уходит пуш, повторов нет, настройки модератора. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db, migrate, openDb } from '../src/db/index.js';
import { runReminders } from '../src/reminders.js';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
const pushes: { userId: string; title: string; body: string }[] = [];
const push = { notifyUser: async (userId: string, title: string, body: string) => void pushes.push({ userId, title, body }) };
const DAY = '2026-03-10';
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00Z`); // поток в тесте живёт по UTC

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  db = await openDb({ url });
  if (url) await db.query('drop schema public cascade; create schema public');
  await migrate(db);
  app = await buildApp(db, loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true' }), {
    logger: false,
    messenger: { sendSms: async () => {}, sendEmail: async () => {} },
    push,
  });
});
after(async () => {
  await app.close();
  await db.close();
});

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await app.inject({ method: method as 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as object });
  return { status: res.statusCode, body: res.json() };
}
async function login(target: string) {
  const r = await call('POST', '/v1/auth/request-code', undefined, { channel: 'sms', target });
  return (await call('POST', '/v1/auth/verify', undefined, { channel: 'sms', target, code: r.body.devCode })).body as { accessToken: string; userId: string };
}

describe('Напоминания', () => {
  let mod: { accessToken: string; userId: string };
  let streamId: string;
  const users: Record<'lazy' | 'good', { accessToken: string; userId: string; mid?: string }> = {} as never;

  it('подготовка: поток и два участника', async () => {
    mod = await login('+77020000000');
    await db.query('update users set is_moderator = true where id = $1', [mod.userId]);
    const s = await call('POST', '/v1/mod/streams', mod.accessToken, { name: 'Поток', requireApproval: false });
    streamId = s.body.id;
    assert.deepEqual(s.body.reminders, { enabled: true, morning: '09:00', evening: '21:00' });
    await db.query(`update streams set timezone = 'UTC', start_date = '2026-03-01', duration_days = 30 where id = $1`, [streamId]);
    for (const [k, phone] of [['lazy', '+77020000001'], ['good', '+77020000002']] as const) {
      const u = await login(phone);
      await call('POST', '/v1/me/consent', u.accessToken, { version: 'v1' });
      await call('POST', '/v1/me/join', u.accessToken, { code: s.body.code });
      const [m] = await db.query<{ id: string }>('select id from memberships where user_id = $1', [u.userId]);
      users[k] = { ...u, mid: m.id };
    }
    // «Хороший» участник: заявление и шаги есть, единственная задача сделана
    const good = users.good.mid!;
    const [g] = await db.query<{ id: string }>('select id from goals where membership_id = $1 limit 1', [good]);
    const task = randomUUID();
    await db.query(`insert into tasks (id, membership_id, goal_id, text, date) values ($1, $2, $3, 'Задача', $4)`, [task, good, g.id, DAY]);
    await db.query('insert into task_completions (task_id, date, done) values ($1, $2, true)', [task, DAY]);
    await db.query(`insert into statements (membership_id, date, text) values ($1, $2, 'Настрой')`, [good, DAY]);
    await db.query('insert into steps (membership_id, date, count) values ($1, $2, 9000)', [good, DAY]);
    // «Ленивый»: две задачи на день, одна сделана
    const lazy = users.lazy.mid!;
    const [gl] = await db.query<{ id: string }>('select id from goals where membership_id = $1 limit 1', [lazy]);
    const t1 = randomUUID();
    await db.query(`insert into tasks (id, membership_id, goal_id, text, date, repeat_daily) values ($1, $2, $3, 'Ежедневная', '2026-03-01', true)`, [t1, lazy, gl.id]);
    await db.query(`insert into tasks (id, membership_id, goal_id, text, date) values ($1, $2, $3, 'Разовая', $4)`, [randomUUID(), lazy, gl.id, DAY]);
    await db.query('insert into task_completions (task_id, date, done) values ($1, $2, true)', [t1, DAY]);
  });

  it('до времени напоминаний ничего не уходит', async () => {
    assert.equal(await runReminders(db, push, at('08:59')), 0);
  });

  it('утро: только тому, кто не прислал заявление и шаги, и только один раз', async () => {
    pushes.length = 0;
    assert.equal(await runReminders(db, push, at('09:01')), 1);
    assert.equal(pushes[0].userId, users.lazy.userId);
    assert.match(pushes[0].body, /заявление и отметьте шаги/);
    assert.equal(await runReminders(db, push, at('09:30')), 0, 'повтора нет');
    assert.equal(await runReminders(db, push, at('11:30')), 0, 'окно 2 часа прошло');
  });

  it('вечер: тем, у кого остались задачи, с их количеством', async () => {
    pushes.length = 0;
    assert.equal(await runReminders(db, push, at('21:00')), 1);
    assert.equal(pushes[0].userId, users.lazy.userId);
    assert.equal(pushes[0].body, 'Осталась одна задача — закройте день.');
    assert.equal(await runReminders(db, push, at('21:05')), 0);
  });

  it('модератор меняет время и выключает напоминания', async () => {
    const bad = await call('PATCH', `/v1/mod/streams/${streamId}`, mod.accessToken, { reminders: { morning: '25:00' } });
    assert.equal(bad.status, 400);
    const ok = await call('PATCH', `/v1/mod/streams/${streamId}`, mod.accessToken, { reminders: { morning: '07:30' } });
    assert.deepEqual(ok.body.reminders, { enabled: true, morning: '07:30', evening: '21:00' });
    const st = await call('GET', '/v1/me/state', users.lazy.accessToken);
    assert.deepEqual(st.body.reminders, { enabled: true, morning: '07:30', evening: '21:00' });

    await db.query('delete from reminder_log');
    pushes.length = 0;
    assert.equal(await runReminders(db, push, at('07:31')), 1, 'новое время работает');

    await db.query('delete from reminder_log');
    await call('PATCH', `/v1/mod/streams/${streamId}`, mod.accessToken, { reminders: { enabled: false } });
    assert.equal(await runReminders(db, push, at('07:31')), 0, 'выключено');
    assert.equal(await runReminders(db, push, at('21:00')), 0);
  });

  it('после окончания потока напоминаний нет', async () => {
    await call('PATCH', `/v1/mod/streams/${streamId}`, mod.accessToken, { reminders: { enabled: true } });
    await db.query('delete from reminder_log');
    assert.equal(await runReminders(db, push, new Date('2026-04-15T21:00:00Z')), 0);
  });
});
