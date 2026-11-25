/** Голосовые заявления: загрузка, прослушивание, права, удаление файлов. */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db, migrate, openDb } from '../src/db/index.js';
import { todayIn } from '../src/lib/time.js';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
const uploads = mkdtempSync(path.join(tmpdir(), 'kaktus-uploads-'));
const today = todayIn('Asia/Almaty');
const audio = Buffer.concat([Buffer.from('ftypM4A '), Buffer.alloc(4000, 7)]);
const VOICE_MAX_MB = 8; // в тесте предел маленький, чтобы проверить его быстро

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  db = await openDb({ url });
  if (url) await db.query('drop schema public cascade; create schema public');
  await migrate(db);
  app = await buildApp(db, loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true', UPLOAD_DIR: uploads, VOICE_MAX_MB: String(VOICE_MAX_MB) }), {
    logger: false,
    messenger: { sendSms: async () => {}, sendEmail: async () => {} },
    push: { notifyUser: async () => {} },
  });
});
after(async () => {
  await app.close();
  await db.close();
});

type Res = { status: number; body: Record<string, unknown> & { [k: string]: unknown }; raw: Buffer; type?: string };
async function call(method: string, url: string, token?: string, body?: unknown, type?: string): Promise<Res> {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  if (type) headers['content-type'] = type;
  const res = await app.inject({ method: method as 'GET', url, headers, payload: body as string });
  let json: Res['body'] = {};
  try {
    json = res.json();
  } catch {}
  return { status: res.statusCode, body: json, raw: res.rawPayload, type: String(res.headers['content-type'] ?? '') };
}
async function login(target: string) {
  const r = await call('POST', '/v1/auth/request-code', undefined, { channel: 'sms', target });
  return (await call('POST', '/v1/auth/verify', undefined, { channel: 'sms', target, code: r.body.devCode })).body as { accessToken: string; userId: string };
}
const voiceFiles = () => (existsSync(path.join(uploads, 'voice')) ? readdirSync(path.join(uploads, 'voice'), { recursive: true }).filter((f) => String(f).includes('.')) : []);

describe('Голосовые заявления', () => {
  let mod: { accessToken: string; userId: string };
  let anna: { accessToken: string; userId: string };
  let membershipId: string;

  it('подготовка', async () => {
    mod = await login('+77030000000');
    await db.query('update users set is_moderator = true where id = $1', [mod.userId]);
    const s = await call('POST', '/v1/mod/streams', mod.accessToken, { name: 'Поток', requireApproval: false });
    anna = await login('+77030000001');
    await call('POST', '/v1/me/consent', anna.accessToken, { version: 'v1' });
    await call('POST', '/v1/me/join', anna.accessToken, { code: s.body.code });
    membershipId = (await db.query<{ id: string }>('select id from memberships where user_id = $1', [anna.userId]))[0].id;
  });

  it('загрузка: формат, длительность, пустая запись', async () => {
    const url = `/v1/me/statements/${today}/voice`;
    assert.equal((await call('PUT', `${url}?duration=40`, anna.accessToken, audio, 'video/mp4')).status, 415);
    assert.equal((await call('PUT', `${url}?duration=${25 * 3600}`, anna.accessToken, audio, 'audio/mp4')).status, 400, 'длительность — не больше суток');
    assert.equal((await call('PUT', `${url}?duration=40`, anna.accessToken, Buffer.alloc(10), 'audio/mp4')).status, 400);
    const ok = await call('PUT', `${url}?duration=40`, anna.accessToken, audio, 'audio/mp4');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(voiceFiles().length, 1);

    const st = await call('GET', '/v1/me/state', anna.accessToken);
    const today_ = (st.body.statements as Record<string, { kind: string; durationSec: number }>)[today];
    assert.equal(today_.kind, 'voice');
    assert.equal(today_.durationSec, 40);
  });

  it('длинная запись (полтора часа) принимается — ограничения в 2 минуты нет', async () => {
    const long = Buffer.alloc(5 * 1024 * 1024, 3); // ~5 МБ ≈ 10 минут речи; длительность — 90 минут
    const r = await call('PUT', `/v1/me/statements/${today}/voice?duration=5400`, anna.accessToken, long, 'audio/mp4');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const st = await call('GET', '/v1/me/state', anna.accessToken);
    assert.equal((st.body.statements as Record<string, { durationSec: number }>)[today].durationSec, 5400);
    assert.equal((await call('GET', `/v1/me/statements/${today}/audio`, anna.accessToken)).raw.length, long.length);
  });

  it('технический предел размера: больше — 413, недописанный файл удаляется', async () => {
    const before = voiceFiles().length;
    const huge = Buffer.alloc(VOICE_MAX_MB * 1024 * 1024 + 1024, 1);
    const r = await call('PUT', `/v1/me/statements/${today}/voice?duration=60`, anna.accessToken, huge, 'audio/mp4');
    assert.equal(r.status, 413);
    assert.equal(voiceFiles().length, before);
  });

  it('перезапись заменяет файл, а не копит их', async () => {
    await call('PUT', `/v1/me/statements/${today}/voice?duration=55`, anna.accessToken, audio, 'audio/mp4');
    assert.equal(voiceFiles().length, 1);
  });

  it('участник и его модератор слушают запись', async () => {
    const own = await call('GET', `/v1/me/statements/${today}/audio`, anna.accessToken);
    assert.equal(own.status, 200);
    assert.equal(own.type, 'audio/mp4');
    assert.deepEqual(own.raw, audio);
    const m = await call('GET', `/v1/mod/members/${membershipId}/statements/${today}/audio`, mod.accessToken);
    assert.equal(m.status, 200);
    assert.deepEqual(m.raw, audio);
    const dossier = await call('GET', `/v1/mod/members/${membershipId}`, mod.accessToken);
    const day = (dossier.body.days as { statement: { kind: string; durationSec: number } }[])[0];
    assert.equal(day.statement.kind, 'voice');
    assert.equal(day.statement.durationSec, 55);
  });

  it('подписанная ссылка: открывается без входа, подделку и чужого не пускает', async () => {
    const link = await call('GET', `/v1/me/statements/${today}/audio-link`, anna.accessToken);
    assert.equal(link.status, 200);
    const byLink = await call('GET', String(link.body.url));
    assert.equal(byLink.status, 200);
    assert.deepEqual(byLink.raw, audio);
    const modLink = await call('GET', `/v1/mod/members/${membershipId}/statements/${today}/audio-link`, mod.accessToken);
    assert.deepEqual((await call('GET', String(modLink.body.url))).raw, audio);
    const forged = String(link.body.url).slice(0, -3) + 'abc';
    assert.equal((await call('GET', forged)).status, 403);
  });

  it('без входа и чужому модератору — нельзя', async () => {
    assert.equal((await call('GET', `/v1/me/statements/${today}/audio`)).status, 401);
    const other = await login('+77039999999');
    await db.query('update users set is_moderator = true where id = $1', [other.userId]);
    assert.equal((await call('GET', `/v1/mod/members/${membershipId}/statements/${today}/audio`, other.accessToken)).status, 404);
    assert.equal((await call('GET', `/v1/mod/members/${membershipId}/statements/${today}/audio-link`, other.accessToken)).status, 404);
  });

  it('текстовое заявление вместо голоса удаляет файл', async () => {
    assert.equal((await call('PUT', `/v1/me/statements/${today}`, anna.accessToken, { text: 'Передумала, пишу текстом' })).status, 200);
    assert.equal(voiceFiles().length, 0);
    assert.equal((await call('GET', `/v1/me/statements/${today}/audio`, anna.accessToken)).status, 404);
  });

  it('«Переписать» и удаление аккаунта удаляют файлы', async () => {
    await call('PUT', `/v1/me/statements/${today}/voice?duration=10`, anna.accessToken, audio, 'audio/webm');
    assert.equal(voiceFiles().length, 1);
    await call('DELETE', `/v1/me/statements/${today}`, anna.accessToken);
    assert.equal(voiceFiles().length, 0);
    await call('PUT', `/v1/me/statements/${today}/voice?duration=10`, anna.accessToken, audio, 'audio/webm');
    assert.equal((await call('DELETE', '/v1/me', anna.accessToken)).status, 200);
    assert.equal(voiceFiles().length, 0);
  });
});
