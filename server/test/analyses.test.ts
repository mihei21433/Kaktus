/** Анализы: замеры, нормы по полу, статусы, индекс здоровья, бланки, журнал доступа. */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db, migrate, openDb } from '../src/db/index.js';
import { addDays, todayIn } from '../src/lib/time.js';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
const uploads = mkdtempSync(path.join(tmpdir(), 'kaktus-blanks-'));
const today = todayIn('Asia/Almaty');
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3000, 1)]);

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  db = await openDb({ url });
  if (url) await db.query('drop schema public cascade; create schema public');
  await migrate(db);
  app = await buildApp(db, loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true', UPLOAD_DIR: uploads }), {
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
async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.inject({ method: method as 'GET', url, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, payload: body as string });
  let json: J = {};
  try {
    json = res.json();
  } catch {}
  return { status: res.statusCode, body: json, raw: res.rawPayload };
}
async function login(target: string) {
  const r = await call('POST', '/v1/auth/request-code', undefined, { channel: 'sms', target });
  return (await call('POST', '/v1/auth/verify', undefined, { channel: 'sms', target, code: r.body.devCode })).body as { accessToken: string; userId: string };
}
const blankFiles = () => (existsSync(path.join(uploads, 'blanks')) ? readdirSync(path.join(uploads, 'blanks'), { recursive: true }).filter((f) => String(f).includes('.')) : []);

describe('Анализы', () => {
  let mod: { accessToken: string; userId: string };
  let anna: { accessToken: string; userId: string };
  let boris: { accessToken: string; userId: string };
  let streamId: string;
  let mid: string;
  let annaMembership: string;

  it('подготовка: поток, участница и участник', async () => {
    mod = await login('+77040000000');
    await db.query(`update users set is_moderator = true, name = 'Марина' where id = $1`, [mod.userId]);
    const s = await call('POST', '/v1/mod/streams', mod.accessToken, { name: 'Поток', requireApproval: false });
    streamId = s.body.id;
    assert.equal(s.body.targetIndex, 75);
    for (const [phone, key] of [['+77040000001', 'anna'], ['+77040000002', 'boris']] as const) {
      const u = await login(phone);
      await call('POST', '/v1/me/consent', u.accessToken, { version: 'v1' });
      await call('POST', '/v1/me/join', u.accessToken, { code: s.body.code });
      if (key === 'anna') anna = u;
      else boris = u;
    }
    annaMembership = (await db.query<{ id: string }>('select id from memberships where user_id = $1', [anna.userId]))[0].id;
  });

  it('до замера: панель есть, сдавать некуда', async () => {
    const a = await call('GET', '/v1/me/analyses', anna.accessToken);
    assert.equal(a.body.catalog.length, 46);
    assert.equal(a.body.measurements.length, 0);
    assert.equal(a.body.currentId, null);
    const st = await call('GET', '/v1/me/state', anna.accessToken);
    assert.equal(st.body.analyses.current, null);
    // пол не указан: норма тестостерона зависит от пола
    const t = a.body.catalog.find((i: J) => i.id === 'testosterone_free');
    assert.equal(t.norm, null);
    assert.equal(t.normLabel, 'норма зависит от пола');
  });

  it('модератор открывает замер — участник видит его на «Сегодня»', async () => {
    const bad = await call('POST', `/v1/mod/streams/${streamId}/measurements`, mod.accessToken, { name: 'Осенний замер', deadline: '2020-01-01' });
    assert.equal(bad.status, 400);
    const r = await call('POST', `/v1/mod/streams/${streamId}/measurements`, mod.accessToken, { name: 'Осенний замер', deadline: addDays(today, 14) });
    assert.equal(r.status, 200);
    mid = r.body.id;
    const st = await call('GET', '/v1/me/state', anna.accessToken);
    assert.deepEqual(st.body.analyses.current, { id: mid, name: 'Осенний замер', deadline: addDays(today, 14), submitted: false });
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/measurements`, anna.accessToken, { name: 'x', deadline: today })).status, 403);
  });

  it('нормы по полу и по фазе цикла', async () => {
    await call('PUT', '/v1/me/sex', anna.accessToken, { sex: 'female' });
    await call('PUT', '/v1/me/sex', boris.accessToken, { sex: 'male' });
    const fa = (await call('GET', '/v1/me/analyses', anna.accessToken)).body.catalog;
    const ma = (await call('GET', '/v1/me/analyses', boris.accessToken)).body.catalog;
    const find = (c: J[], id: string) => c.find((i) => i.id === id);
    assert.deepEqual(find(fa, 'testosterone_free').norm, { lo: 1, hi: 1.7 });
    assert.deepEqual(find(ma, 'testosterone_free').norm, { lo: 8.9, hi: 42 });
    assert.equal(find(fa, 'estradiol').norm, null);
    assert.equal(find(fa, 'estradiol').normLabel, 'по фазе цикла — оценивает модератор');
    assert.deepEqual(find(ma, 'estradiol').norm, { lo: 40, hi: 160 });
    assert.equal(find(fa, 'rf').normLabel, '< 30');
    assert.equal(find(fa, 'hdl').normLabel, '> 1');
  });

  it('бланки: загрузка, ссылка, удаление, формат', async () => {
    const url = `/v1/me/measurements/${mid}/blanks`;
    assert.equal((await call('POST', url, anna.accessToken, jpeg, { 'content-type': 'text/plain' })).status, 415);
    const up = await call('POST', url, anna.accessToken, jpeg, { 'content-type': 'image/jpeg', 'x-file-name': encodeURIComponent('бланк инвитро.jpg') });
    assert.equal(up.status, 200, JSON.stringify(up.body));
    const second = await call('POST', url, anna.accessToken, jpeg, { 'content-type': 'image/jpeg' });
    assert.equal(blankFiles().length, 2);
    const a = (await call('GET', '/v1/me/analyses', anna.accessToken)).body;
    assert.deepEqual(a.measurements[0].blanks.map((b: J) => b.fileName), ['бланк инвитро.jpg', 'бланк.jpg']);
    const link = await call('GET', `/v1/me/blanks/${up.body.id}/link`, anna.accessToken);
    const file = await call('GET', link.body.url);
    assert.equal(file.status, 200);
    assert.deepEqual(file.raw, jpeg);
    assert.equal((await call('GET', `/v1/me/blanks/${up.body.id}/link`, boris.accessToken)).status, 404, 'чужой бланк');
    await call('DELETE', `/v1/me/blanks/${second.body.id}`, anna.accessToken);
    assert.equal(blankFiles().length, 1);
  });

  it('значения: статусы и сводка', async () => {
    const put = (ind: string, value: number, comparator = '=') => call('PUT', `/v1/me/measurements/${mid}/values/${ind}`, anna.accessToken, { value, comparator });
    assert.equal((await put('nope', 1)).status, 404);
    assert.equal((await put('glucose', 5.1)).status, 200);
    await put('vit_d', 24);
    await put('hdl', 0.9);
    await put('ast', 36);
    await put('estradiol', 300);
    const m = (await call('GET', '/v1/me/analyses', anna.accessToken)).body.measurements[0];
    assert.equal(m.values.glucose.status, 'normal');
    assert.equal(m.values.vit_d.status, 'low');
    assert.equal(m.values.hdl.status, 'low');
    assert.equal(m.values.ast.status, 'border');
    assert.equal(m.values.estradiol.status, 'unknown');
    assert.deepEqual(m.summary, { filled: 5, normal: 1, border: 1, deviation: 2, unknown: 1, total: 46 });
    assert.equal(m.index, null, 'индекс считается после заливки');
  });

  it('заливка: индекс здоровья по формуле 60/25/15', async () => {
    const r = await call('POST', `/v1/me/measurements/${mid}/submit`, anna.accessToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.filled, 5);
    const m = (await call('GET', '/v1/me/analyses', anna.accessToken)).body.measurements[0];
    // 43 оцениваемых показателя (3 — по фазе цикла): глюкоза 1 + витамин D 0,1 + ЛПВП 0,9 + АсАТ 1 = 3 → 3/43 ≈ 7%
    assert.equal(m.index.analyses, 7);
    assert.equal(m.index.fitness, 0);
    assert.equal(m.index.regularity, 0);
    assert.equal(m.index.total, 4); // 0,0698 × 0,6 / 1
    assert.ok(m.submittedAt);
    const st = await call('GET', '/v1/me/state', anna.accessToken);
    assert.equal(st.body.analyses.current.submitted, true);
    assert.equal(st.body.analyses.index, 4);
  });

  it('модератор видит анализы и бланк — это пишется в журнал доступа', async () => {
    const a = await call('GET', `/v1/mod/members/${annaMembership}/analyses`, mod.accessToken);
    assert.equal(a.status, 200);
    assert.equal(a.body.measurements[0].values.vit_d.value, 24);
    const blankId = a.body.measurements[0].blanks[0].id;
    const link = await call('GET', `/v1/mod/members/${annaMembership}/blanks/${blankId}/link`, mod.accessToken);
    assert.deepEqual((await call('GET', link.body.url)).raw, jpeg);
    await call('GET', `/v1/mod/members/${annaMembership}`, mod.accessToken);
    const log = await call('GET', '/v1/me/access-log', anna.accessToken);
    assert.deepEqual(log.body.map((r: J) => r.kind), ['dossier', 'blank', 'analyses']);
    assert.equal(log.body[0].moderator, 'Марина');
    assert.equal((await call('GET', '/v1/me/access-log', boris.accessToken)).body.length, 0);

    const other = await login('+77049999999');
    await db.query('update users set is_moderator = true where id = $1', [other.userId]);
    assert.equal((await call('GET', `/v1/mod/members/${annaMembership}/analyses`, other.accessToken)).status, 404);
  });

  it('закрытый замер не принимает данные; целевой индекс меняется', async () => {
    assert.equal((await call('POST', `/v1/mod/measurements/${mid}/close`, mod.accessToken)).status, 200);
    assert.equal((await call('PUT', `/v1/me/measurements/${mid}/values/glucose`, anna.accessToken, { value: 5 })).status, 409);
    assert.equal((await call('POST', `/v1/me/measurements/${mid}/blanks`, anna.accessToken, jpeg, { 'content-type': 'image/jpeg' })).status, 409);
    const list = await call('GET', `/v1/mod/streams/${streamId}/measurements`, mod.accessToken);
    assert.equal(list.body[0].submitted, 1);
    assert.ok(list.body[0].closedAt);
    const p = await call('PATCH', `/v1/mod/streams/${streamId}`, mod.accessToken, { targetIndex: 80 });
    assert.equal(p.body.targetIndex, 80);
    assert.equal((await call('GET', '/v1/me/analyses', anna.accessToken)).body.targetIndex, 80);
  });

  it('удаление аккаунта удаляет бланки', async () => {
    assert.equal(blankFiles().length, 1);
    assert.equal((await call('DELETE', '/v1/me', anna.accessToken)).status, 200);
    assert.equal(blankFiles().length, 0);
  });
});
