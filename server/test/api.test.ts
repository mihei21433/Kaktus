/**
 * Сквозной сценарий через HTTP API. По умолчанию — встроенная база PGlite в памяти;
 * с TEST_DATABASE_URL — настоящий PostgreSQL (база очищается перед запуском).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db, migrate, openDb } from '../src/db/index.js';
import { todayIn } from '../src/lib/time.js';

type App = Awaited<ReturnType<typeof buildApp>>;

let db: Db;
let app: App;
const pushes: { userId: string; title: string }[] = [];
const today = todayIn('Asia/Almaty');

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  db = await openDb({ url });
  if (url) await db.query('drop schema public cascade; create schema public');
  await migrate(db);
  const cfg = loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true' });
  app = await buildApp(db, cfg, {
    logger: false,
    messenger: { sendSms: async () => {}, sendEmail: async () => {} },
    push: { notifyUser: async (userId, title) => void pushes.push({ userId, title }) },
  });
});

after(async () => {
  await app.close();
  await db.close();
});

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await app.inject({
    method: method as 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body as object,
  });
  return { status: res.statusCode, body: res.json() };
}

async function login(channel: 'sms' | 'email', target: string) {
  const r = await call('POST', '/v1/auth/request-code', undefined, { channel, target });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/v1/auth/verify', undefined, { channel, target, code: r.body.devCode });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return v.body as { accessToken: string; refreshToken: string; userId: string };
}

describe('Кактус API', () => {
  let mod: { accessToken: string; userId: string };
  let user: { accessToken: string; refreshToken: string; userId: string };
  let streamCode: string;

  it('вход по SMS: неверный код, лимит, верный код', async () => {
    const r = await call('POST', '/v1/auth/request-code', undefined, { channel: 'sms', target: '8 (777) 111-22-33' });
    assert.equal(r.status, 200);
    assert.equal(r.body.target, '+77771112233');
    assert.match(r.body.devCode, /^\d{6}$/);

    const again = await call('POST', '/v1/auth/request-code', undefined, { channel: 'sms', target: '+77771112233' });
    assert.equal(again.status, 429);

    const wrong = await call('POST', '/v1/auth/verify', undefined, { channel: 'sms', target: '+77771112233', code: r.body.devCode === '000000' ? '111111' : '000000' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error, 'code_wrong');

    const ok = await call('POST', '/v1/auth/verify', undefined, { channel: 'sms', target: '+77771112233', code: r.body.devCode });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.isNew, true);
    user = ok.body;

    const reuse = await call('POST', '/v1/auth/verify', undefined, { channel: 'sms', target: '+77771112233', code: r.body.devCode });
    assert.equal(reuse.status, 400, 'код одноразовый');
  });

  it('браузерная версия может отправлять PUT и DELETE (CORS)', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/me/steps/2026-01-01',
      headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'PUT' },
    });
    assert.equal(res.statusCode, 204);
    assert.match(String(res.headers['access-control-allow-methods']), /PUT/);
    assert.match(String(res.headers['access-control-allow-methods']), /DELETE/);
    assert.match(String(res.headers['access-control-allow-methods']), /PATCH/);
  });

  it('неверный номер и почта отклоняются', async () => {
    assert.equal((await call('POST', '/v1/auth/request-code', undefined, { channel: 'sms', target: '123' })).status, 400);
    assert.equal((await call('POST', '/v1/auth/request-code', undefined, { channel: 'email', target: 'not-an-email' })).status, 400);
  });

  it('без токена и не модератору — отказ', async () => {
    assert.equal((await call('GET', '/v1/me/state')).status, 401);
    assert.equal((await call('GET', '/v1/me/state', 'garbage')).status, 401);
    assert.equal((await call('GET', '/v1/mod/streams', user.accessToken)).status, 403);
  });

  it('модератор (вход по почте) создаёт поток', async () => {
    mod = await login('email', 'Marina@Example.kz');
    await db.query(`update users set is_moderator = true, name = 'Марина Ковалёва' where id = $1`, [mod.userId]);
    const s = await call('POST', '/v1/mod/streams', mod.accessToken, { name: 'Поток «Весна»', durationDays: 90 });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.match(s.body.code, /^[A-Z]{6}$/);
    assert.equal(s.body.moderator, 'Марина Ковалёва');
    streamCode = s.body.code;
  });

  it('вступление: без согласия нельзя, неверный код, заявка', async () => {
    const noConsent = await call('POST', '/v1/me/join', user.accessToken, { code: streamCode });
    assert.equal(noConsent.status, 409);

    assert.equal((await call('POST', '/v1/me/consent', user.accessToken, { version: '2026-11-01' })).status, 200);
    const bad = await call('POST', '/v1/me/join', user.accessToken, { code: 'ZZZZZZ' });
    assert.equal(bad.status, 404);
    assert.match(bad.body.message, /Такого кода нет/);

    const ok = await call('POST', '/v1/me/join', user.accessToken, { code: streamCode.toLowerCase() });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'pending');

    const twice = await call('POST', '/v1/me/join', user.accessToken, { code: streamCode });
    assert.equal(twice.status, 409);

    const st = await call('GET', '/v1/me/state', user.accessToken);
    assert.equal(st.body.membership.status, 'pending');
    assert.equal(st.body.membership.stream.name, 'Поток «Весна»');
    assert.equal(st.body.goals.length, 0);
  });

  it('до одобрения данные писать нельзя', async () => {
    const r = await call('PUT', `/v1/me/steps/${today}`, user.accessToken, { count: 5000 });
    assert.equal(r.status, 409);
  });

  it('модератор одобряет заявку, участник получает цели и пуш', async () => {
    const [{ id: streamId }] = await db.query<{ id: string }>('select id from streams where code = $1', [streamCode]);
    const list = await call('GET', `/v1/mod/streams/${streamId}/memberships?status=pending`, mod.accessToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].phone, '+77771112233');

    const ap = await call('POST', `/v1/mod/memberships/${list.body[0].id}/approve`, mod.accessToken);
    assert.equal(ap.status, 200);
    assert.deepEqual(pushes.at(-1), { userId: user.userId, title: 'Заявка одобрена' });

    const again = await call('POST', `/v1/mod/memberships/${list.body[0].id}/approve`, mod.accessToken);
    assert.equal(again.status, 409);

    const st = await call('GET', '/v1/me/state', user.accessToken);
    assert.equal(st.body.membership.status, 'approved');
    assert.deepEqual(
      st.body.goals.map((g: { title: string }) => g.title),
      ['Здоровье', 'Отношения', 'Финансы', 'Личный бренд'],
    );
  });

  it('профиль, задачи, заявление, шаги, нормативы, цели', async () => {
    const t = user.accessToken;
    assert.equal((await call('PUT', '/v1/me/profile', t, { name: 'Алексей', about: 'Программист', contract: 'Обещаю', accepted: true })).status, 200);

    const st0 = await call('GET', '/v1/me/state', t);
    const health = st0.body.goals[0].id;

    const taskId = randomUUID();
    const task = { id: taskId, goalId: health, text: 'Пройти 8000 шагов', date: today, repeatDaily: true, minValue: 8000, unit: 'шагов' };
    assert.equal((await call('POST', '/v1/me/tasks', t, task)).status, 200);
    assert.equal((await call('POST', '/v1/me/tasks', t, task)).status, 200, 'повтор запроса безопасен');
    assert.equal((await call('PUT', `/v1/me/tasks/${taskId}/completions/${today}`, t, { done: true })).status, 200);
    const old = await call('PUT', `/v1/me/tasks/${taskId}/completions/2020-01-01`, t, { done: true });
    assert.equal(old.status, 400, 'старую дату менять нельзя');

    assert.equal((await call('PUT', `/v1/me/statements/${today}`, t, { text: 'Сегодня спокойна и собрана' })).status, 200);
    assert.equal((await call('PUT', `/v1/me/steps/${today}`, t, { count: 10100 })).status, 200);
    assert.equal((await call('PUT', `/v1/me/fitness/${today}/plank`, t, { value: 75 })).status, 200);
    assert.equal((await call('PUT', `/v1/me/fitness/${today}/unknown`, t, { value: 1 })).status, 404);

    const crit = [{ id: 'c1', text: 'Вес 68 кг', done: true }, { id: 'c2', text: 'Сон 7,5 ч', done: false }];
    assert.equal((await call('PUT', `/v1/me/goals/${health}`, t, { result: 'Снизить вес до 66 кг', criteria: crit })).status, 200);
    assert.equal((await call('PUT', `/v1/me/goals/${health}`, t, { title: 'Другое' })).status, 403, 'название общей цели не меняется');

    const own = randomUUID();
    assert.equal((await call('POST', '/v1/me/goals', t, { id: own, title: 'Испанский', result: 'A2' })).status, 200);
    const interim = randomUUID();
    assert.equal((await call('POST', '/v1/me/interim', t, { id: interim, goalId: health, horizon: 'week', text: '15 км', target: 15, unit: 'км' })).status, 200);
    assert.equal((await call('PUT', `/v1/me/interim/${interim}`, t, { progress: 9 })).status, 200);

    const st = await call('GET', '/v1/me/state', t);
    assert.equal(st.body.profile.name, 'Алексей');
    assert.equal(st.body.profile.completed, true);
    assert.ok(st.body.profile.contractAcceptedAt);
    assert.deepEqual(st.body.tasks[0].completions, { [today]: true });
    assert.equal(st.body.tasks[0].minValue, 8000);
    assert.equal(st.body.statements[today].text, 'Сегодня спокойна и собрана');
    assert.equal(st.body.steps[today], 10100);
    assert.equal(st.body.fitness[today].plank, 75);
    assert.equal(st.body.goals[0].result, 'Снизить вес до 66 кг');
    assert.deepEqual(st.body.goals[0].criteria, crit);
    assert.equal(st.body.goals.at(-1).custom, true);
    assert.equal(st.body.interim[0].progress, 9);
    assert.equal(st.body.interim[0].target, 15);

    assert.equal((await call('DELETE', `/v1/me/tasks/${taskId}`, t)).status, 200);
    assert.equal((await call('GET', '/v1/me/state', t)).body.tasks.length, 0);
  });

  it('чужие данные недоступны', async () => {
    const other = await login('sms', '+77770000001');
    await call('POST', '/v1/me/consent', other.accessToken, { version: '2026-11-01' });
    const st = await call('GET', '/v1/me/state', user.accessToken);
    const r = await call('PUT', `/v1/me/goals/${st.body.goals[0].id}`, other.accessToken, { result: 'взлом' });
    assert.equal(r.status, 409, 'не участник потока');
  });

  it('обновление токена: старый refresh повторно не работает', async () => {
    const r1 = await call('POST', '/v1/auth/refresh', undefined, { refreshToken: user.refreshToken });
    assert.equal(r1.status, 200);
    const r2 = await call('POST', '/v1/auth/refresh', undefined, { refreshToken: user.refreshToken });
    assert.equal(r2.status, 401);
    user = { ...user, ...r1.body };
  });

  it('отказ: участник видит его и может ввести другой код', async () => {
    const p = await login('sms', '+77770000002');
    await call('POST', '/v1/me/consent', p.accessToken, { version: '2026-11-01' });
    await call('POST', '/v1/me/join', p.accessToken, { code: streamCode });
    const [m] = await db.query<{ id: string }>(`select id from memberships where status = 'pending'`);
    assert.equal((await call('POST', `/v1/mod/memberships/${m.id}/reject`, mod.accessToken)).status, 200);
    assert.equal((await call('GET', '/v1/me/state', p.accessToken)).body.membership.status, 'rejected');
    assert.equal((await call('POST', '/v1/me/join/cancel', p.accessToken)).status, 200);
    assert.equal((await call('GET', '/v1/me/state', p.accessToken)).body.membership.status, 'none');
    assert.equal((await call('POST', '/v1/me/join', p.accessToken, { code: streamCode })).body.status, 'pending');
  });

  it('выход из потока и удаление аккаунта', async () => {
    assert.equal((await call('POST', '/v1/me/leave', user.accessToken)).status, 200);
    assert.equal((await call('GET', '/v1/me/state', user.accessToken)).body.membership.status, 'none');
    assert.equal((await call('DELETE', '/v1/me', mod.accessToken)).status, 409, 'владелец потока не удаляется');
    assert.equal((await call('DELETE', '/v1/me', user.accessToken)).status, 200);
    assert.equal((await call('GET', '/v1/me/state', user.accessToken)).status, 401);
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from users where phone = '+77771112233'`);
    assert.equal(n, 0);
  });
});
