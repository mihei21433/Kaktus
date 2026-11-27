/** Вход без SMS: код потока + имя, личный код входа, новый код от модератора. */
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

const fmt = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;

describe('Вход по кодам', () => {
  let owner: { accessToken: string; userId: string };
  let streamId: string;
  let streamCode: string;
  let anna: { accessToken: string; refreshToken: string; userId: string; loginCode: string; membership: string };

  it('подготовка: поток без подтверждения', async () => {
    owner = await login('+77090000000');
    await db.query('update users set is_moderator = true where id = $1', [owner.userId]);
    const s = await call('POST', '/v1/mod/streams', owner.accessToken, { name: 'Весна', requireApproval: false });
    streamId = s.body.id;
    streamCode = s.body.code;
  });

  it('участник: код потока + имя → сразу внутри, личный код входа показан один раз', async () => {
    // набрано на русской раскладке и строчными — тоже подходит
    const typed = streamCode.toLowerCase().replace(/a/g, 'а');
    const r = await call('POST', '/v1/auth/join', undefined, { streamCode: typed, name: 'Анна', consentVersion: 'v1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    anna = r.body;
    assert.match(anna.loginCode, fmt);
    assert.equal(anna.membership, 'approved');
    const st = await call('GET', '/v1/me/state', anna.accessToken);
    assert.equal(st.body.membership.status, 'approved');
    assert.equal(st.body.goals.length, 4);
    assert.equal(st.body.profile.name, 'Анна');
    assert.ok(st.body.consent);
    assert.equal(st.body.account.phone, null);
    assert.ok(st.body.account.loginCodeSetAt);
    // в базе — только отпечаток кода
    const [u] = await db.query<{ login_code_hash: string }>('select login_code_hash from users where id = $1', [anna.userId]);
    assert.ok(!u.login_code_hash.includes(anna.loginCode.replace('-', '')));
  });

  it('неверный код потока — аккаунт не создаётся', async () => {
    const before = (await db.query<{ n: number }>('select count(*)::int as n from users'))[0].n;
    const r = await call('POST', '/v1/auth/join', undefined, { streamCode: 'ZZZZZZ', name: 'Кто-то', consentVersion: 'v1' });
    assert.equal(r.status, 404);
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from users'))[0].n, before);
    assert.equal((await call('POST', '/v1/auth/join', undefined, { streamCode, name: '', consentVersion: 'v1' })).status, 400);
  });

  it('вход по личному коду на другом телефоне; неверный код — отказ', async () => {
    const r = await call('POST', '/v1/auth/code-login', undefined, { code: anna.loginCode.toLowerCase().replace('-', ' ') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.userId, anna.userId);
    assert.equal((await call('POST', '/v1/auth/code-login', undefined, { code: 'AAAAA-AAAAA' })).body.error, 'wrong_code');
    assert.equal((await call('POST', '/v1/auth/code-login', undefined, { code: '123' })).body.error, 'bad_code');
  });

  it('участник сам выпускает новый код — старый перестаёт работать', async () => {
    const r = await call('POST', '/v1/me/login-code', anna.accessToken);
    assert.match(r.body.loginCode, fmt);
    assert.equal((await call('POST', '/v1/auth/code-login', undefined, { code: anna.loginCode })).status, 401);
    assert.equal((await call('POST', '/v1/auth/code-login', undefined, { code: r.body.loginCode })).status, 200);
    anna.loginCode = r.body.loginCode;
  });

  it('модератор выдаёт новый код участнику — старые входы закрываются', async () => {
    const [m] = await db.query<{ id: string }>('select id from memberships where user_id = $1', [anna.userId]);
    const r = await call('POST', `/v1/mod/members/${m.id}/login-code`, owner.accessToken);
    assert.match(r.body.loginCode, fmt);
    assert.equal((await call('POST', '/v1/auth/code-login', undefined, { code: anna.loginCode })).status, 401);
    assert.equal((await call('POST', '/v1/auth/refresh', undefined, { refreshToken: anna.refreshToken })).status, 401);
    assert.equal((await call('POST', '/v1/auth/code-login', undefined, { code: r.body.loginCode })).status, 200);
    // чужой участник — не найден
    const stranger = await login('+77090000009');
    await db.query('update users set is_moderator = true where id = $1', [stranger.userId]);
    assert.equal((await call('POST', `/v1/mod/members/${m.id}/login-code`, stranger.accessToken)).status, 404);
  });

  it('модератор команды по имени: получает код входа и входит без SMS', async () => {
    const r = await call('POST', `/v1/mod/streams/${streamId}/team`, owner.accessToken, { name: 'Ольга' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.loginCode, fmt);
    const olga = await call('POST', '/v1/auth/code-login', undefined, { code: r.body.loginCode });
    const st = await call('GET', '/v1/me/state', olga.body.accessToken);
    assert.equal(st.body.account.isModerator, true);
    assert.equal((await call('GET', '/v1/mod/streams', olga.body.accessToken)).body[0].myRole, 'moderator');
    // владелец выдаёт ей новый код
    const n = await call('POST', `/v1/mod/streams/${streamId}/team/${olga.body.userId}/login-code`, owner.accessToken);
    assert.match(n.body.loginCode, fmt);
    assert.equal((await call('POST', '/v1/auth/code-login', undefined, { code: r.body.loginCode })).status, 401);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/team`, owner.accessToken, {})).body.error, 'no_name');
  });

  it('владелец по SMS может завести себе код входа', async () => {
    const r = await call('POST', '/v1/me/login-code', owner.accessToken);
    const again = await call('POST', '/v1/auth/code-login', undefined, { code: r.body.loginCode });
    assert.equal(again.body.userId, owner.userId);
  });

  it('с подтверждением заявок: участник внутри, но ждёт решения', async () => {
    const s = await call('POST', '/v1/mod/streams', owner.accessToken, { name: 'Лето', requireApproval: true });
    // владелец уже в потоке «Весна» как модератор; новый участник — в «Лето»
    const r = await call('POST', '/v1/auth/join', undefined, { streamCode: s.body.code, name: 'Борис', consentVersion: 'v1' });
    assert.equal(r.body.membership, 'pending');
    const req = await call('GET', '/v1/mod/requests', owner.accessToken);
    assert.ok(req.body.some((x: J) => x.name === 'Борис' && x.streamName === 'Лето'));
  });
});

describe('Регистрация: имя, фамилия, телефон, свой контракт', () => {
  let code: string;
  let owner: { accessToken: string; userId: string };
  before(async () => {
    owner = await login('+77091000000');
    await db.query('update users set is_moderator = true where id = $1', [owner.userId]);
    code = (await call('POST', '/v1/mod/streams', owner.accessToken, { name: 'Осень', requireApproval: false })).body.code;
  });

  it('фамилия и телефон обязательны; телефон виден модератору', async () => {
    const base = { streamCode: code, consentVersion: 'v1' };
    assert.equal((await call('POST', '/v1/auth/join', undefined, { ...base, firstName: 'Анна', lastName: '', phone: '87071234567' })).body.error, 'no_name');
    assert.equal((await call('POST', '/v1/auth/join', undefined, { ...base, firstName: 'Анна', lastName: 'Смирнова' })).body.error, 'no_phone');
    assert.equal((await call('POST', '/v1/auth/join', undefined, { ...base, firstName: 'Анна', lastName: 'Смирнова', phone: '123' })).body.error, 'bad_phone');
    const r = await call('POST', '/v1/auth/join', undefined, { ...base, firstName: ' Анна ', lastName: 'Смирнова', phone: '8 707 123 45 67' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const st = await call('GET', '/v1/me/state', r.body.accessToken);
    assert.equal(st.body.profile.name, 'Анна Смирнова');
    assert.equal(st.body.profile.phone, '+77071234567');
    assert.equal(st.body.account.phone, null); // по этому номеру нельзя войти через SMS — он не подтверждён

    const [m] = await db.query<{ id: string }>('select id from memberships where user_id = $1', [r.body.userId]);
    const d = await call('GET', `/v1/mod/members/${m.id}`, owner.accessToken);
    assert.equal(d.body.member.contact, '+77071234567');

    // тот же номер в том же потоке — вторая регистрация не проходит
    const dup = await call('POST', '/v1/auth/join', undefined, { ...base, firstName: 'Анна', lastName: 'Смирнова', phone: '+7 707 123-45-67' });
    assert.equal(dup.body.error, 'phone_taken');

    // контракт пишется своими словами: пустой принять нельзя
    assert.equal((await call('PUT', '/v1/me/profile', r.body.accessToken, { about: '', contract: '  ', accepted: true })).body.error, 'no_contract');
    const ok = await call('PUT', '/v1/me/profile', r.body.accessToken, { about: '', contract: 'Каждый день гуляю час и ложусь до 23:00', accepted: true, phone: '87070000001' });
    assert.equal(ok.status, 200);
    const st2 = await call('GET', '/v1/me/state', r.body.accessToken);
    assert.equal(st2.body.profile.contract, 'Каждый день гуляю час и ложусь до 23:00');
    assert.ok(st2.body.profile.contractAcceptedAt);
    assert.equal(st2.body.profile.phone, '+77070000001');
  });
});
