/** Команда модераторов, физнормативы и нормы анализов потока. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db, migrate, openDb } from '../src/db/index.js';
import { addDays, todayIn } from '../src/lib/time.js';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
const pushes: { userId: string; title: string; data: unknown }[] = [];
const today = todayIn('Asia/Almaty');

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  db = await openDb({ url });
  if (url) await db.query('drop schema public cascade; create schema public');
  await migrate(db);
  app = await buildApp(db, loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true' }), {
    logger: false,
    messenger: { sendSms: async () => {}, sendEmail: async () => {} },
    push: { notifyUser: async (userId: string, title: string, _body: string, data?: unknown) => void pushes.push({ userId, title, data }) },
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

describe('Команда модераторов', () => {
  let owner: { accessToken: string; userId: string };
  let helper: { accessToken: string; userId: string };
  let participant: { accessToken: string; userId: string };
  let streamId: string;

  it('владелец создаёт поток и видит себя в команде', async () => {
    owner = await login('+77050000000');
    await db.query(`update users set is_moderator = true, name = 'Марина' where id = $1`, [owner.userId]);
    const s = await call('POST', '/v1/mod/streams', owner.accessToken, { name: 'Поток', requireApproval: false });
    streamId = s.body.id;
    const t = await call('GET', `/v1/mod/streams/${streamId}/team`, owner.accessToken);
    assert.equal(t.body.myRole, 'owner');
    assert.equal(t.body.members.length, 1);
    assert.equal(t.body.members[0].isMe, true);

    participant = await login('+77050000009');
    await call('POST', '/v1/me/consent', participant.accessToken, { version: 'v1' });
    assert.equal((await call('POST', '/v1/me/join', participant.accessToken, { code: s.body.code })).status, 200);
  });

  it('приглашение по номеру: новый человек становится модератором и получает пуш', async () => {
    const r = await call('POST', `/v1/mod/streams/${streamId}/team`, owner.accessToken, { contact: '8 705 000 00 01', name: 'Ольга' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.members.length, 2);
    assert.equal(r.body.members[1].role, 'moderator');
    assert.equal(r.body.members[1].name, 'Ольга');
    assert.equal(r.body.members[1].contact, '+77050000001');

    helper = await login('+77050000001');
    assert.equal(pushes.at(-1)?.userId, helper.userId);
    assert.deepEqual(pushes.at(-1)?.data, { type: 'team' });
    const st = await call('GET', '/v1/me/state', helper.accessToken);
    assert.equal(st.body.account.isModerator, true);
    const list = await call('GET', '/v1/mod/streams', helper.accessToken);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].myRole, 'moderator');
  });

  it('повтор и участник потока — понятные отказы', async () => {
    const again = await call('POST', `/v1/mod/streams/${streamId}/team`, owner.accessToken, { contact: '+77050000001' });
    assert.equal(again.body.error, 'already_in_team');
    const member = await call('POST', `/v1/mod/streams/${streamId}/team`, owner.accessToken, { contact: '+77050000009' });
    assert.equal(member.body.error, 'is_participant');
    const bad = await call('POST', `/v1/mod/streams/${streamId}/team`, owner.accessToken, { contact: '12345' });
    assert.equal(bad.status, 400);
  });

  it('модератор команды работает с участниками, но не меняет настройки', async () => {
    assert.equal((await call('GET', `/v1/mod/streams/${streamId}/members`, helper.accessToken)).body.length, 1);
    assert.equal((await call('GET', `/v1/mod/streams/${streamId}`, helper.accessToken)).body.myRole, 'moderator');
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/broadcasts`, helper.accessToken, { text: 'Привет' })).status, 200);
    assert.equal((await call('PATCH', `/v1/mod/streams/${streamId}`, helper.accessToken, { name: 'Чужой' })).status, 403);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/new-code`, helper.accessToken)).status, 403);
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/norms`, helper.accessToken, { norms: [] })).status, 403);
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/indicators/ldh`, helper.accessToken, { off: true })).status, 403);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/measurements`, helper.accessToken, { name: 'З', deadline: addDays(today, 7) })).status, 403);
    assert.equal((await call('POST', `/v1/mod/streams/${streamId}/team`, helper.accessToken, { contact: '+77050000002' })).status, 403);
    assert.equal((await call('DELETE', `/v1/mod/streams/${streamId}/team/${owner.userId}`, helper.accessToken)).status, 403);
  });

  it('владельца убрать нельзя; модератор выходит сам и теряет доступ', async () => {
    assert.equal((await call('DELETE', `/v1/mod/streams/${streamId}/team/${owner.userId}`, owner.accessToken)).body.error, 'owner');
    assert.equal((await call('DELETE', `/v1/mod/streams/${streamId}/team/${helper.userId}`, helper.accessToken)).status, 200);
    assert.equal((await call('GET', `/v1/mod/streams/${streamId}/members`, helper.accessToken)).status, 404);
    assert.equal((await call('GET', '/v1/mod/streams', helper.accessToken)).body.length, 0);
  });

  it('владелец убирает модератора', async () => {
    await call('POST', `/v1/mod/streams/${streamId}/team`, owner.accessToken, { contact: '+77050000001' });
    assert.equal((await call('DELETE', `/v1/mod/streams/${streamId}/team/${helper.userId}`, owner.accessToken)).status, 200);
    assert.equal((await call('GET', `/v1/mod/streams/${streamId}/team`, owner.accessToken)).body.members.length, 1);
  });
});

describe('Нормы потока', () => {
  let owner: { accessToken: string; userId: string };
  let anna: { accessToken: string; userId: string };
  let streamId: string;
  let mid: string;

  it('подготовка', async () => {
    owner = await login('+77060000000');
    await db.query(`update users set is_moderator = true where id = $1`, [owner.userId]);
    const s = await call('POST', '/v1/mod/streams', owner.accessToken, { name: 'Поток', requireApproval: false });
    streamId = s.body.id;
    anna = await login('+77060000001');
    await call('POST', '/v1/me/consent', anna.accessToken, { version: 'v1' });
    await call('POST', '/v1/me/join', anna.accessToken, { code: s.body.code });
    await call('PUT', '/v1/me/sex', anna.accessToken, { sex: 'female' });
    mid = (await call('POST', `/v1/mod/streams/${streamId}/measurements`, owner.accessToken, { name: 'Замер', deadline: addDays(today, 7) })).body.id;
  });

  it('физнормативы: старые id сохраняются, новые появляются у участника', async () => {
    const st = await call('GET', '/v1/me/state', anna.accessToken);
    const [plank] = st.body.membership.stream.norms;
    assert.equal(plank.id, 'plank');
    await call('PUT', `/v1/me/fitness/${today}/plank`, anna.accessToken, { value: 60 });
    const r = await call('PUT', `/v1/mod/streams/${streamId}/norms`, owner.accessToken, {
      norms: [
        { id: 'plank', name: 'Планка', unit: 'сек', norm: 120 },
        { name: 'Отжимания', unit: 'раз', norm: 30 },
      ],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pushups = r.body.norms[1];
    assert.match(pushups.id, /^n_[0-9a-f]{8}$/);
    const st2 = await call('GET', '/v1/me/state', anna.accessToken);
    assert.deepEqual(st2.body.membership.stream.norms.map((n: J) => [n.id, n.norm]), [['plank', 120], [pushups.id, 30]]);
    assert.equal(st2.body.fitness[today].plank, 60);
    assert.equal((await call('PUT', `/v1/me/fitness/${today}/${pushups.id}`, anna.accessToken, { value: 10 })).status, 200);
    assert.equal((await call('PUT', `/v1/me/fitness/${today}/squats`, anna.accessToken, { value: 10 })).status, 404);
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/norms`, owner.accessToken, { norms: [{ name: '', unit: '', norm: 1 }] })).status, 400);
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/norms`, owner.accessToken, { norms: [{ name: 'Бег', unit: 'км', norm: 0 }] })).status, 400);
  });

  it('нормы анализов: своя норма, выключенный показатель, нормы по полу', async () => {
    const before = await call('GET', `/v1/mod/streams/${streamId}/indicators`, owner.accessToken);
    assert.equal(before.body.length, 46);
    const glucose = before.body.find((i: J) => i.id === 'glucose');
    assert.deepEqual(glucose.current, { norm: { lo: 4.1, hi: 6 } });
    assert.equal(glucose.bySex, false);

    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/indicators/glucose`, owner.accessToken, { norm: { lo: 3.9, hi: 5.5 } })).status, 200);
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/indicators/ldh`, owner.accessToken, { off: true })).status, 200);
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/indicators/estradiol`, owner.accessToken, { female: { lo: 100, hi: 1000 } })).status, 200);
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/indicators/creatinine`, owner.accessToken, { norm: { lo: 1, hi: 2 } })).body.error, 'bad_norm');
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/indicators/glucose`, owner.accessToken, { norm: { lo: 6, hi: 5 } })).status, 400);
    assert.equal((await call('PUT', `/v1/mod/streams/${streamId}/indicators/glucose`, owner.accessToken, { norm: {} })).status, 400);

    const a = await call('GET', '/v1/me/analyses', anna.accessToken);
    assert.equal(a.body.catalog.length, 45);
    assert.ok(!a.body.catalog.some((c: J) => c.id === 'ldh'));
    assert.deepEqual(a.body.catalog.find((c: J) => c.id === 'glucose').norm, { lo: 3.9, hi: 5.5 });
    assert.deepEqual(a.body.catalog.find((c: J) => c.id === 'estradiol').norm, { lo: 100, hi: 1000 });

    // значение по выключенному показателю не принимаем, по своей норме — статус по ней
    assert.equal((await call('PUT', `/v1/me/measurements/${mid}/values/ldh`, anna.accessToken, { value: 150 })).status, 404);
    await call('PUT', `/v1/me/measurements/${mid}/values/glucose`, anna.accessToken, { value: 5.8 });
    const a2 = await call('GET', '/v1/me/analyses', anna.accessToken);
    assert.equal(a2.body.measurements[0].values.glucose.status, 'high');
    assert.equal(a2.body.measurements[0].summary.total, 45);

    const mod = await call('GET', `/v1/mod/streams/${streamId}/indicators`, owner.accessToken);
    const g2 = mod.body.find((i: J) => i.id === 'glucose');
    assert.equal(g2.changed, true);
    assert.deepEqual(g2.default, { norm: { lo: 4.1, hi: 6 } });
    assert.equal(mod.body.find((i: J) => i.id === 'ldh').off, true);
    const e = mod.body.find((i: J) => i.id === 'estradiol');
    assert.equal(e.cycle, true);
    assert.deepEqual(e.current, { female: { lo: 100, hi: 1000 }, male: { lo: 40, hi: 160 } });
  });

  it('сброс возвращает общую норму', async () => {
    await call('DELETE', `/v1/mod/streams/${streamId}/indicators/glucose`, owner.accessToken);
    await call('PUT', `/v1/mod/streams/${streamId}/indicators/ldh`, owner.accessToken, {});
    const a = await call('GET', '/v1/me/analyses', anna.accessToken);
    assert.equal(a.body.catalog.length, 46);
    assert.deepEqual(a.body.catalog.find((c: J) => c.id === 'glucose').norm, { lo: 4.1, hi: 6 });
    assert.equal(a.body.measurements[0].values.glucose.status, 'normal');
  });
});
