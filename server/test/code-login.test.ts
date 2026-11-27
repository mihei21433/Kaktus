/** Вход без SMS: код потока + имя, личный код входа, новый код от модератора. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

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
  app = await buildApp(db, loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true', UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), 'kaktus-avatars-')) }), {
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

describe('Аккаунт: имя, фамилия, телефон, фото', () => {
  it('участник и модератор меняют данные; фото видно модератору; удаление фото', async () => {
    const owner = await login('+77092000000');
    await db.query('update users set is_moderator = true where id = $1', [owner.userId]);
    const code = (await call('POST', '/v1/mod/streams', owner.accessToken, { name: 'Зима', requireApproval: false })).body.code;
    const r = await call('POST', '/v1/auth/join', undefined, { streamCode: code, firstName: 'Анна', lastName: 'Смирнова', phone: '87073330000', consentVersion: 'v1' });
    const t = r.body.accessToken;
    let st = await call('GET', '/v1/me/state', t);
    assert.deepEqual([st.body.profile.firstName, st.body.profile.lastName, st.body.profile.avatarUrl], ['Анна', 'Смирнова', null]);

    assert.equal((await call('PUT', '/v1/me/account', t, { firstName: ' ', lastName: 'X' })).body.error, 'no_name');
    assert.equal((await call('PUT', '/v1/me/account', t, { firstName: 'Анна-Мария', lastName: 'Иванова', phone: '+7 707 444 00 00' })).status, 200);
    st = await call('GET', '/v1/me/state', t);
    assert.equal(st.body.profile.name, 'Анна-Мария Иванова');
    assert.equal(st.body.profile.phone, '+77074440000');

    // фото: любая картинка → квадрат 512×512 JPEG по ссылке, которую нельзя подобрать
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#4FC879' } }).png().toBuffer();
    const up = await app.inject({ method: 'POST', url: '/v1/me/avatar', headers: { authorization: `Bearer ${t}`, 'content-type': 'image/png' }, payload: png });
    assert.equal(up.statusCode, 200, up.body);
    const url = up.json().avatarUrl as string;
    assert.match(url, /^\/v1\/files\/avatar\/[a-f0-9]{32}\.jpg$/);
    const img = await app.inject({ method: 'GET', url });
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/jpeg');
    const meta = await sharp(img.rawPayload).metadata();
    assert.deepEqual([meta.width, meta.height], [512, 512]);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/files/avatar/../../etc/passwd' })).statusCode, 404);

    const [m] = await db.query<{ id: string }>('select id from memberships where user_id = $1', [r.body.userId]);
    const list = await call('GET', `/v1/mod/streams/${(await db.query<{ id: string }>('select stream_id as id from memberships where id = $1', [m.id]))[0].id}/members`, owner.accessToken);
    assert.equal(list.body[0].avatarUrl, url);
    assert.equal(list.body[0].name, 'Анна-Мария Иванова');
    const d = await call('GET', `/v1/mod/members/${m.id}`, owner.accessToken);
    assert.equal(d.body.member.avatarUrl, url);
    assert.equal(d.body.member.contact, '+77074440000');

    // новое фото заменяет старое: прежняя ссылка больше не работает
    const up2 = await app.inject({ method: 'POST', url: '/v1/me/avatar', headers: { authorization: `Bearer ${t}`, 'content-type': 'image/png' }, payload: png });
    assert.notEqual(up2.json().avatarUrl, url);
    assert.equal((await app.inject({ method: 'GET', url })).statusCode, 404);
    assert.equal((await call('DELETE', '/v1/me/avatar', t)).status, 200);
    assert.equal((await app.inject({ method: 'GET', url: up2.json().avatarUrl })).statusCode, 404);
    assert.equal((await call('GET', '/v1/me/state', t)).body.profile.avatarUrl, null);

    // модератор тоже редактирует свой аккаунт; его номер для входа по SMS не меняется
    assert.equal((await call('PUT', '/v1/me/account', owner.accessToken, { firstName: 'Марина', lastName: 'Ковалёва', phone: '87015551111' })).status, 200);
    const so = await call('GET', '/v1/me/state', owner.accessToken);
    assert.equal(so.body.profile.name, 'Марина Ковалёва');
    assert.equal(so.body.account.phone, '+77092000000');
    const team = await call('GET', `/v1/mod/streams/${(await db.query<{ id: string }>('select id from streams where name = $1', ['Зима']))[0].id}/team`, owner.accessToken);
    assert.equal(team.body.members[0].contact, '+77015551111');
  });
});
