/** Распознавание бланков и шагов: разбор текста (правила) и путь через API с настоящим Tesseract. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db, migrate, openDb } from '../src/db/index.js';
import { addDays, todayIn } from '../src/lib/time.js';
import { parseBlank, parseSteps } from '../src/recognition/blank.js';
import { ocrAvailable } from '../src/recognition/ocr.js';

const byId = (text: string) => Object.fromEntries(parseBlank(text).map((f) => [f.indicatorId, f]));

describe('Разбор текста бланка', () => {
  it('обычные строки таблицы', () => {
    const r = byId(`Исследование Результат Ед. изм. Референсные значения
Глюкоза 5,3 ммоль/л 4,1 - 5,9
Гликированный гемоглобин (HbA1c) 5.6 % < 6,0
Холестерин-ЛПВП 1,35 ммоль/л > 1,0
Холестерин общий 5,8 ммоль/л 3,2 - 5,6
Антитела к ТПО <1,0 МЕ/мл < 5,6
ТТГ (тиреотропный гормон) 2,1 мкМЕ/мл 0,4 - 4,0`);
    assert.equal(r.glucose.value, 5.3);
    assert.equal(r.hba1c.value, 5.6);
    assert.equal(r.hdl.value, 1.35);
    assert.equal(r.cholesterol.value, 5.8);
    assert.deepEqual([r.anti_tpo.comparator, r.anti_tpo.value], ['<', 1]);
    assert.equal(r.tsh.value, 2.1);
    assert.ok(Object.values(r).every((f) => !f.check));
  });

  it('похожие названия не путаются', () => {
    const r = byId(`Общая железосвязывающая способность 60 мкмоль/л 45 - 77
Холестерин не-ЛПВП 4,45 ммоль/л < 3,8
Креатинин в моче 9,1 ммоль/л
Билирубин прямой 3,1 мкмоль/л < 8,6
Железо 15,2 мкмоль/л 9 - 30,4`);
    assert.equal(r.iron.value, 15.2);
    assert.equal(r.cholesterol, undefined);
    assert.equal(r.creatinine, undefined);
    assert.equal(r.bilirubin_direct.value, 3.1);
    assert.equal(r.bilirubin_total, undefined);
  });

  it('только норма без результата — значения нет; первое значение показателя побеждает', () => {
    const r = byId(`Глюкоза 4,1 - 5,9 ммоль/л
Триглицериды ail ммоль/л <1,7
Мочевина 4,6 ммоль/л
Мочевина 9,9 ммоль/л`);
    assert.equal(r.glucose, undefined);
    assert.equal(r.triglycerides, undefined);
    assert.equal(r.urea.value, 4.6);
  });

  it('другие единицы переводятся и помечаются', () => {
    const r = byId(`Глюкоза 99 мг/дл 70 - 100
25-OH витамин D 61 нмоль/л 75 - 250
Цинк 13,1 мкмоль/л 11 - 18`);
    assert.equal(r.glucose.value, 5.495);
    assert.equal(r.vit_d.value, 24.439);
    assert.equal(r.zinc.value, 0.856);
    assert.ok(r.glucose.check && r.vit_d.check && r.zinc.check);
    assert.match(r.glucose.note!, /мг\/дл/);
  });

  it('потерянная запятая исправляется и помечается', () => {
    const r = byId(`Холестерин-ЛПВП 135 ммоль/л > 1,0
Мочевина 46 ммоль/л 2,8 - 7,2`);
    assert.equal(r.hdl.value, 1.35);
    assert.equal(r.urea.value, 4.6);
    assert.ok(r.hdl.check);
    assert.match(r.hdl.note!, /запятая/);
  });

  it('ошибки распознавания в названиях', () => {
    const r = byId(`2 Билирубим общий 12.4 мкмоль/л 3,4 -20,5
Антитела к TNO <1,0 ME/mn <5,6
rcnr 62 нмоль/л 26,1 - 110`);
    assert.equal(r.bilirubin_total.value, 12.4);
    assert.ok(r.bilirubin_total.check);
    assert.equal(r.anti_tpo.value, 1);
    assert.equal(r.shbg.value, 62);
  });
});

describe('Шаги со скриншота', () => {
  it('число рядом со словом «шаги», а не цель и не калории', () => {
    assert.equal(parseSteps('14:32\nСегодня\nШаги\n8 345\nЦель 10 000\n6,2 км 312 ккал').steps, 8345);
    assert.equal(parseSteps('Steps 12,480 · Goal 10,000').steps, 12480);
    assert.equal(parseSteps('Пульс 72\nСон 7 ч').steps, null);
  });
});

/* ---------- Через API с настоящим распознаванием ---------- */

const hasOcr = await ocrAvailable();

describe('Распознавание через API', { skip: hasOcr ? false : 'Tesseract не установлен' }, () => {
  let db: Db;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let anna: { accessToken: string };
  let mid: string;
  const fx = (f: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', f));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type J = any;
  async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.inject({ method: method as 'GET', url, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, payload: body as string });
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

  before(async () => {
    const url = process.env.TEST_DATABASE_URL;
    db = await openDb({ url });
    if (url) await db.query('drop schema public cascade; create schema public');
    await migrate(db);
    app = await buildApp(db, loadConfig({ NODE_ENV: 'test', DEV_RETURN_CODES: 'true', UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), 'kaktus-ocr-')) }), {
      logger: false,
      messenger: { sendSms: async () => {}, sendEmail: async () => {} },
      push: { notifyUser: async () => {} },
    });
    const mod = await login('+77080000000');
    await db.query('update users set is_moderator = true where phone = $1', ['+77080000000']);
    const s = await call('POST', '/v1/mod/streams', mod.accessToken, { name: 'Поток', requireApproval: false });
    anna = await login('+77080000001');
    await call('POST', '/v1/me/consent', anna.accessToken, { version: 'v1' });
    await call('POST', '/v1/me/join', anna.accessToken, { code: s.body.code });
    mid = (await call('POST', `/v1/mod/streams/${s.body.id}/measurements`, mod.accessToken, { name: 'Замер', deadline: addDays(todayIn('Asia/Almaty'), 7) })).body.id;
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('без бланков — понятная ошибка', async () => {
    assert.equal((await call('POST', `/v1/me/measurements/${mid}/recognize`, anna.accessToken)).body.error, 'no_blanks');
  });

  it('фото и PDF: значения найдены, но не сохранены; затем сохраняются разом', async () => {
    await call('POST', `/v1/me/measurements/${mid}/blanks`, anna.accessToken, fx('blank-photo.jpg'), { 'content-type': 'image/jpeg' });
    await call('POST', `/v1/me/measurements/${mid}/blanks`, anna.accessToken, fx('blank-text.pdf'), { 'content-type': 'application/pdf' });
    await call('PUT', `/v1/me/measurements/${mid}/values/glucose`, anna.accessToken, { value: 5.1 });
    const r = await call('POST', `/v1/me/measurements/${mid}/recognize`, anna.accessToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.blanks.length, 2);
    assert.ok(r.body.blanks[0].found >= 30, `на фото найдено ${r.body.blanks[0].found}`);
    const g = r.body.found.find((f: J) => f.indicatorId === 'glucose');
    assert.equal(g.value, 5.3);
    assert.deepEqual(g.current, { value: 5.1, comparator: '=' });
    assert.equal(g.name, 'Глюкоза');

    const a = await call('GET', '/v1/me/analyses', anna.accessToken);
    assert.equal(a.body.measurements[0].values.glucose.value, 5.1); // распознавание ничего не записало

    const save = await call('PUT', `/v1/me/measurements/${mid}/values`, anna.accessToken, {
      values: r.body.found.map((f: J) => ({ indicatorId: f.indicatorId, value: f.value, comparator: f.comparator })),
    });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    const a2 = await call('GET', '/v1/me/analyses', anna.accessToken);
    assert.equal(a2.body.measurements[0].values.glucose.value, 5.3);
    assert.equal(a2.body.measurements[0].summary.filled, r.body.found.length);
    assert.equal((await call('PUT', `/v1/me/measurements/${mid}/values`, anna.accessToken, { values: [{ indicatorId: 'nope', value: 1 }] })).status, 404);
  });

  it('шаги со скриншота', async () => {
    const r = await call('POST', '/v1/me/steps/recognize', anna.accessToken, fx('steps.png'), { 'content-type': 'image/png' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.steps, 8345);
    assert.equal((await call('POST', '/v1/me/steps/recognize', anna.accessToken, fx('blank-text.pdf'), { 'content-type': 'application/pdf' })).status, 415);
  });
});
