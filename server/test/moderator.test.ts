/** Кабинет модератора: статусы участников, досье, задача участнику, рассылка, настройки. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db, migrate, openDb } from '../src/db/index.js';
import { addDays, todayIn } from '../src/lib/time.js';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
const pushes: { userId: string; title: string; body: string }[] = [];
const today = todayIn('Asia/Almaty');

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  db = await openDb({ url });
  if (url) await db.query('drop schema public cascade; create schema public');
  await migrate(db);
  app = await buildApp(db, loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true' }), {
    logger: false,
    messenger: { sendSms: async () => {}, sendEmail: async () => {} },
    push: { notifyUser: async (userId, title, body) => void pushes.push({ userId, title, body }) },
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
  const v = await call('POST', '/v1/auth/verify', undefined, { channel: 'sms', target, code: r.body.devCode });
  return v.body as { accessToken: string; userId: string };
}

describe('Кабинет модератора', () => {
  let mod: { accessToken: string; userId: string };
  let streamId: string;
  let code: string;
  const people: Record<string, { accessToken: string; userId: string; membershipId?: string }> = {};

  it('модератор создаёт поток, участники подают заявки', async () => {
    mod = await login('+77010000000');
    await db.query(`update users set is_moderator = true, name = 'Марина' where id = $1`, [mod.userId]);
    const s = await call('POST', '/v1/mod/streams', mod.accessToken, { name: 'Поток «Весна»' });
    streamId = s.body.id;
    code = s.body.code;
    for (const [i, name] of ['Анна', 'Борис', 'Вера', 'Глеб'].entries()) {
      const p = await login(`+7701000000${i + 1}`);
      await call('POST', '/v1/me/consent', p.accessToken, { version: 'v1' });
      await call('PUT', '/v1/me/profile', p.accessToken, { name, about: '', contract: '', accepted: false });
      await call('POST', '/v1/me/join', p.accessToken, { code });
      people[name] = p;
    }
    const pending = await call('GET', '/v1/mod/requests?status=pending', mod.accessToken);
    assert.equal(pending.status, 200);
    assert.equal(pending.body.length, 4);
    assert.equal(pending.body[0].streamCode, code);
    for (const r of pending.body) {
      await call('POST', `/v1/mod/memberships/${r.id}/approve`, mod.accessToken);
      const name = r.name as string;
      people[name].membershipId = r.id;
    }
    assert.equal((await call('GET', '/v1/mod/requests?status=approved', mod.accessToken)).body.length, 4);
  });

  it('статусы: по плану, отстаёт, без отправок, новый', async () => {
    const start = addDays(today, -5);
    // Анна, Борис, Глеб — в потоке 6 дней; Вера — с сегодня
    for (const n of ['Анна', 'Борис', 'Глеб']) {
      await db.query(`update memberships set decided_at = ($2::date + time '12:00') at time zone 'Asia/Almaty' where id = $1`, [people[n].membershipId, start]);
    }
    const goalOf = async (mid: string) => (await db.query<{ id: string }>('select id from goals where membership_id = $1 limit 1', [mid]))[0].id;
    const addRepeatTask = async (n: string) => {
      const id = randomUUID();
      await db.query('insert into tasks (id, membership_id, goal_id, text, date, repeat_daily) values ($1, $2, $3, $4, $5, true)', [id, people[n].membershipId, await goalOf(people[n].membershipId!), 'Пройти 8000 шагов', start]);
      return id;
    };
    // Анна выполняет каждый день и вчера прислала заявление
    const ta = await addRepeatTask('Анна');
    for (let d = 1; d <= 5; d++) await db.query('insert into task_completions (task_id, date, done) values ($1, $2, true)', [ta, addDays(today, -d)]);
    await db.query('insert into statements (membership_id, date, text) values ($1, $2, $3)', [people['Анна'].membershipId, addDays(today, -1), 'Настрой хороший']);
    // Борис молчит
    await addRepeatTask('Борис');
    // Глеб выполнил один день из пяти, вчера прислал шаги
    const tg = await addRepeatTask('Глеб');
    await db.query('insert into task_completions (task_id, date, done) values ($1, $2, true)', [tg, addDays(today, -4)]);
    await db.query('insert into steps (membership_id, date, count) values ($1, $2, 4000)', [people['Глеб'].membershipId, addDays(today, -1)]);

    const members = await call('GET', `/v1/mod/streams/${streamId}/members`, mod.accessToken);
    assert.equal(members.status, 200);
    const label = Object.fromEntries(members.body.map((m: { name: string; label: string }) => [m.name, m.label]));
    assert.deepEqual(label, { Анна: 'on_plan', Борис: 'no_reports', Вера: 'new', Глеб: 'behind' });

    const ov = await call('GET', '/v1/mod/overview', mod.accessToken);
    assert.deepEqual(ov.body.streams[0].counts, { on_plan: 1, behind: 1, no_reports: 1, new: 1 });
    assert.equal(ov.body.totals.members, 4);
    assert.equal(ov.body.totals.attention, 2);
  });

  it('досье участника', async () => {
    const d = await call('GET', `/v1/mod/members/${people['Анна'].membershipId}`, mod.accessToken);
    assert.equal(d.status, 200);
    assert.equal(d.body.member.name, 'Анна');
    assert.equal(d.body.stats.label, 'on_plan');
    assert.equal(d.body.stats.dayInStream, 6);
    assert.equal(d.body.stats.taskRate, 1);
    assert.equal(d.body.stats.statementsSent, 1);
    assert.equal(d.body.days.length, 6);
    assert.equal(d.body.days[1].statement.text, 'Настрой хороший');
    assert.equal(d.body.goals.length, 4);
  });

  it('задача от модератора: с комментарием, пушем, участник не удалит', async () => {
    const mid = people['Анна'].membershipId!;
    const d = await call('GET', `/v1/mod/members/${mid}`, mod.accessToken);
    const taskId = randomUUID();
    const r = await call('POST', `/v1/mod/members/${mid}/tasks`, mod.accessToken, {
      id: taskId,
      goalId: d.body.goals[0].id,
      text: 'Выпить витамин D после завтрака',
      date: today,
      comment: 'Анна, витамин D ниже нормы',
      notify: true,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(pushes.at(-1), { userId: people['Анна'].userId, title: 'Модератор добавил задачу', body: 'Выпить витамин D после завтрака' });

    const st = await call('GET', '/v1/me/state', people['Анна'].accessToken);
    const t = st.body.tasks.find((x: { id: string }) => x.id === taskId);
    assert.equal(t.fromModerator, true);
    assert.equal(t.comment, 'Анна, витамин D ниже нормы');
    assert.equal((await call('DELETE', `/v1/me/tasks/${taskId}`, people['Анна'].accessToken)).status, 403);

    const past = await call('POST', `/v1/mod/members/${mid}/tasks`, mod.accessToken, { id: randomUUID(), goalId: d.body.goals[0].id, text: 'x', date: '2020-01-01' });
    assert.equal(past.status, 400);
  });

  it('рассылка всем участникам потока', async () => {
    const before = pushes.length;
    const r = await call('POST', `/v1/mod/streams/${streamId}/broadcasts`, mod.accessToken, { text: 'В субботу общая пробежка в 9:00' });
    assert.equal(r.status, 200);
    assert.equal(r.body.recipients, 4);
    assert.equal(pushes.length - before, 4);
    const h = await call('GET', `/v1/mod/streams/${streamId}/broadcasts`, mod.accessToken);
    assert.equal(h.body[0].text, 'В субботу общая пробежка в 9:00');
    assert.equal(h.body[0].recipients, 4);
  });

  it('блокировка: участник не может писать данные', async () => {
    const mid = people['Борис'].membershipId!;
    assert.equal((await call('POST', `/v1/mod/memberships/${mid}/block`, mod.accessToken)).status, 200);
    assert.equal((await call('GET', '/v1/me/state', people['Борис'].accessToken)).body.membership.status, 'blocked');
    assert.equal((await call('PUT', `/v1/me/steps/${today}`, people['Борис'].accessToken, { count: 100 })).status, 403);
    assert.equal((await call('POST', `/v1/mod/memberships/${mid}/unblock`, mod.accessToken)).status, 200);
    assert.equal((await call('PUT', `/v1/me/steps/${today}`, people['Борис'].accessToken, { count: 100 })).status, 200);
  });

  it('настройки потока и новый код', async () => {
    const p = await call('PATCH', `/v1/mod/streams/${streamId}`, mod.accessToken, { stepsThreshold: 8000, requireApproval: false, modules: { steps: false } });
    assert.equal(p.status, 200);
    assert.equal(p.body.stepsThreshold, 8000);
    assert.equal(p.body.requireApproval, false);
    assert.equal(p.body.modules.steps, false);
    assert.equal(p.body.modules.statements, true, 'остальные разделы не тронуты');
    const st = await call('GET', '/v1/me/state', people['Анна'].accessToken);
    assert.equal(st.body.membership.stream.modules.steps, false);

    const nc = await call('POST', `/v1/mod/streams/${streamId}/new-code`, mod.accessToken);
    assert.notEqual(nc.body.code, code);
    const old = await login('+77010000009');
    await call('POST', '/v1/me/consent', old.accessToken, { version: 'v1' });
    assert.equal((await call('POST', '/v1/me/join', old.accessToken, { code })).status, 404, 'старый код больше не работает');
    assert.equal((await call('POST', '/v1/me/join', old.accessToken, { code: nc.body.code })).body.status, 'approved');
  });

  it('чужой модератор не видит поток и участников', async () => {
    const other = await login('+77019999999');
    await db.query('update users set is_moderator = true where id = $1', [other.userId]);
    assert.equal((await call('GET', `/v1/mod/streams/${streamId}/members`, other.accessToken)).status, 404);
    assert.equal((await call('GET', `/v1/mod/members/${people['Анна'].membershipId}`, other.accessToken)).status, 404);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/broadcasts`, other.accessToken, { text: 'спам' })).status, 404);
    assert.equal((await call('GET', '/v1/mod/requests', other.accessToken)).body.length, 0);
    assert.equal((await call('GET', '/v1/mod/overview', people['Анна'].accessToken)).status, 403);
  });
});
