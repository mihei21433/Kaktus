/** Сроки целей потока и шаблон настроек. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db, migrate, openDb } from '../src/db/index.js';


let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;



before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  db = await openDb({ url });
  if (url) await db.query('drop schema public cascade; create schema public');
  await migrate(db);
  app = await buildApp(db, loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true' }), {
    logger: false,
    messenger: { sendSms: async () => {}, sendEmail: async () => {} },
    push: { notifyUser: async () => {} },
  });
});
after(async () => {
  await app.close();
  await db.close();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await app.inject({ method: method as 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as string });
  let json: J = {};
  try {
    json = res.json();
  } catch {}
  return { status: res.statusCode, body: json };
}
async function login(target: string) {
  const r = await call('POST', '/v1/auth/request-code', undefined, { channel: 'sms', target });
  return (await call('POST', '/v1/auth/verify', undefined, { channel: 'sms', target, code: r.body.devCode })).body as { accessToken: string; userId: string };
}

describe('Сроки целей и шаблон', () => {
  let owner: { accessToken: string; userId: string };
  let anna: { accessToken: string; userId: string };
  let streamId: string;
  let goalId: string;
  let sprint: string;

  it('подготовка: по умолчанию четыре базовых срока', async () => {
    owner = await login('+77070000000');
    await db.query(`update users set is_moderator = true where id = $1`, [owner.userId]);
    const s = await call('POST', '/v1/mod/streams', owner.accessToken, { name: 'Весна', requireApproval: false });
    streamId = s.body.id;
    assert.deepEqual(s.body.horizons.map((h: J) => h.id), ['day', 'week', 'month', 'quarter']);
    anna = await login('+77070000001');
    await call('POST', '/v1/me/consent', anna.accessToken, { version: 'v1' });
    await call('POST', '/v1/me/join', anna.accessToken, { code: s.body.code });
    const st = await call('GET', '/v1/me/state', anna.accessToken);
    goalId = st.body.goals[0].id;
    assert.equal(st.body.membership.stream.horizons.length, 4);
  });

  it('свой срок: создать, поставить цель, удалить нельзя — только выключить', async () => {
    const r = await call('POST', `/v1/mod/streams/${streamId}/horizons`, owner.accessToken, { name: 'Спринт 21 день', days: 21 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    sprint = r.body.at(-1).id;
    assert.match(sprint, /^h_[0-9a-f]{8}$/);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/horizons`, owner.accessToken, { name: 'спринт 21 день', days: 5 })).body.error, 'duplicate');

    const add = (horizon: string) => call('POST', '/v1/me/interim', anna.accessToken, { id: crypto.randomUUID(), goalId, horizon, text: 'Цель' });
    assert.equal((await add(sprint)).status, 200);
    assert.equal((await add('nope')).body.error, 'bad_horizon');

    const list = await call('GET', `/v1/mod/streams/${streamId}/horizons`, owner.accessToken);
    assert.equal(list.body.find((h: J) => h.id === sprint).goals, 1);
    assert.equal((await call('DELETE', `/v1/mod/streams/${streamId}/horizons/${sprint}`, owner.accessToken)).body.error, 'has_goals');
    assert.equal((await call('DELETE', `/v1/mod/streams/${streamId}/horizons/week`, owner.accessToken)).body.error, 'base_horizon');
    assert.equal((await call('PATCH', `/v1/mod/streams/${streamId}/horizons/week`, owner.accessToken, { days: 5 })).body.error, 'base_horizon');

    // выключенный срок: новые цели ставить нельзя
    await call('PATCH', `/v1/mod/streams/${streamId}/horizons/week`, owner.accessToken, { enabled: false });
    assert.equal((await add('week')).body.error, 'bad_horizon');
    const st = await call('GET', '/v1/me/state', anna.accessToken);
    assert.equal(st.body.membership.stream.horizons.find((h: J) => h.id === 'week').enabled, false);

    // пустой свой срок удаляется
    const tmp = (await call('POST', `/v1/mod/streams/${streamId}/horizons`, owner.accessToken, { name: 'Пробный', days: 3, enabled: false })).body.at(-1);
    assert.equal(tmp.enabled, false);
    assert.equal((await call('DELETE', `/v1/mod/streams/${streamId}/horizons/${tmp.id}`, owner.accessToken)).status, 200);
  });

  it('шаблон: сохранить, новый поток получает настройки, применить к старому', async () => {
    assert.equal((await call('GET', '/v1/mod/template', owner.accessToken)).body.template, null);
    await call('PATCH', `/v1/mod/streams/${streamId}`, owner.accessToken, { stepsThreshold: 7000, targetIndex: 80, modules: { statements: false }, reminders: { morning: '08:30' } });
    await call('PUT', `/v1/mod/streams/${streamId}/norms`, owner.accessToken, { norms: [{ name: 'Бег', unit: 'км', norm: 5 }] });
    await call('PUT', `/v1/mod/streams/${streamId}/indicators/ldh`, owner.accessToken, { off: true });
    const saved = await call('POST', `/v1/mod/streams/${streamId}/template`, owner.accessToken);
    assert.equal(saved.body.template.sourceStream, 'Весна');

    const n = await call('POST', '/v1/mod/streams', owner.accessToken, { name: 'Лето', requireApproval: true });
    assert.equal(n.body.stepsThreshold, 7000);
    assert.equal(n.body.targetIndex, 80);
    assert.equal(n.body.modules.statements, false);
    assert.equal(n.body.reminders.morning, '08:30');
    assert.equal(n.body.norms[0].name, 'Бег');
    assert.equal(n.body.horizons.find((h: J) => h.id === 'week').enabled, false);
    assert.ok(n.body.horizons.some((h: J) => h.name === 'Спринт 21 день'));
    const ind = await call('GET', `/v1/mod/streams/${n.body.id}/indicators`, owner.accessToken);
    assert.equal(ind.body.find((i: J) => i.id === 'ldh').off, true);
    assert.equal((await call('GET', `/v1/mod/streams/${n.body.id}`, owner.accessToken)).body.requireApproval, true);

    // применить к старому потоку другой шаблон: свой срок с целями сохраняется выключенным
    await call('PATCH', `/v1/mod/streams/${n.body.id}`, owner.accessToken, { stepsThreshold: 12000 });
    for (const h of n.body.horizons.filter((x: J) => !x.base)) await call('DELETE', `/v1/mod/streams/${n.body.id}/horizons/${h.id}`, owner.accessToken);
    await call('POST', `/v1/mod/streams/${n.body.id}/template`, owner.accessToken);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/apply-template`, owner.accessToken)).status, 200);
    const s = await call('GET', `/v1/mod/streams/${streamId}`, owner.accessToken);
    assert.equal(s.body.stepsThreshold, 12000);
    const kept = s.body.horizons.find((h: J) => h.id === sprint);
    assert.equal(kept.enabled, false);
    assert.equal(kept.name, 'Спринт 21 день');
  });

  it('модератор команды может сохранить шаблон, но не применить и не менять сроки', async () => {
    const helper = await login('+77070000002');
    await call('POST', `/v1/mod/streams/${streamId}/team`, owner.accessToken, { contact: '+77070000002' });
    assert.equal((await call('GET', `/v1/mod/streams/${streamId}/horizons`, helper.accessToken)).status, 200);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/horizons`, helper.accessToken, { name: 'X', days: 2 })).status, 403);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/template`, helper.accessToken)).status, 200);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/apply-template`, helper.accessToken)).status, 403);
  });
});
