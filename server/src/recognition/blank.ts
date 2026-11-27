/**
 * Разбор текста бланка анализов: находим строки с названиями наших показателей и число-результат в них.
 * Это не ИИ, а правила: названия-синонимы, единицы, проверка правдоподобия.
 * Человек всегда проверяет результат на экране «Проверка распознанного» — сами значения не сохраняются.
 */
import { CATALOG, type Indicator, type Range } from '../analyses/catalog.js';

/** Латинские буквы, похожие на русские (и частые ошибки распознавания: П→n, Г→r), сравниваем «по скелету». */
const LOOKALIKE: Record<string, string> = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', n: 'п', o: 'о', p: 'р', r: 'г', t: 'т', u: 'и', x: 'х', y: 'у', ё: 'е' };

/** Нижний регистр, ё → е, латинские двойники → русские. Длина строки не меняется — позиции совпадают с исходной. */
export function norm(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += LOOKALIKE[ch] ?? ch;
  return out;
}

type AliasRule = { aliases: string[]; exclude?: string[] };

/** Названия показателей так, как их пишут лаборатории (Инвитро, Хеликс, KDL, Олимп, Гемотест…). */
const ALIASES: Record<string, AliasRule> = {
  ldh: { aliases: ['лактатдегидрогеназа', 'лдг', 'ldh'] },
  hba1c: { aliases: ['гликированный гемоглобин', 'гликозилированный гемоглобин', 'гликогемоглобин', 'hba1c', 'hb a1c'] },
  glucose: { aliases: ['глюкоза', 'glucose'], exclude: ['толерант', 'моч'] },
  protein: { aliases: ['общий белок', 'белок общий', 'total protein'], exclude: ['реактив', 'моч'] },
  crp: { aliases: ['с-реактивный белок', 'с реактивный белок', 'срб', 'crp'] },
  iron: { aliases: ['железо сывороточное', 'железо в сыворотке', 'сывороточное железо', 'железо', 'iron'], exclude: ['связыва', 'жсс', 'насыщ'] },
  ferritin: { aliases: ['ферритин', 'ferritin'] },
  transferrin: { aliases: ['трансферрин', 'transferrin'], exclude: ['насыщ', 'рецептор'] },
  calcium: { aliases: ['кальций общий', 'общий кальций', 'кальций', 'calcium'], exclude: ['ионизир', 'моч'] },
  vit_a: { aliases: ['витамин а', 'ретинол', 'vitamin a'] },
  vit_c: { aliases: ['витамин с', 'аскорбиновая кислота', 'vitamin c'] },
  zinc: { aliases: ['цинк', 'zinc'] },
  selenium: { aliases: ['селен', 'selenium'] },
  vit_d: { aliases: ['25-он витамин d', '25-oh витамин d', '25(oh)d', '25-гидроксивитамин d', '25-гидроксикальциферол', 'витамин d', '25-oh', 'кальцидиол'], exclude: ['1,25', '1.25'] },
  folate: { aliases: ['фолиевая кислота', 'фолаты', 'фолат', 'folate', 'folic acid'] },
  phosphorus: { aliases: ['фосфор неорганический', 'неорганический фосфор', 'фосфор', 'phosphorus'], exclude: ['моч'] },
  iodine: { aliases: ['йод', 'iodine'] },
  magnesium: { aliases: ['магний', 'magnesium'], exclude: ['моч'] },
  b12: { aliases: ['витамин в12', 'витамин b12', 'цианокобаламин', 'кобаламин', 'b12'] },
  testosterone_free: { aliases: ['тестостерон свободный', 'свободный тестостерон', 'free testosterone'] },
  cortisol: { aliases: ['кортизол', 'cortisol'], exclude: ['моч', 'слюн'] },
  prolactin: { aliases: ['пролактин', 'prolactin'] },
  estradiol: { aliases: ['эстрадиол', 'estradiol', 'э2', 'e2'] },
  fsh: { aliases: ['фолликулостимулирующий гормон', 'фолликулостимулирующий', 'фсг', 'fsh'], exclude: ['/'] },
  shbg: { aliases: ['глобулин, связывающий половые гормоны', 'глобулин связывающий половые гормоны', 'секс-стероид-связывающий глобулин', 'гспг', 'shbg'] },
  lh: { aliases: ['лютеинизирующий гормон', 'лютеинизирующий', 'лг', 'lh'], exclude: ['/'] },
  dhea_s: { aliases: ['дегидроэпиандростерон-сульфат', 'дегидроэпиандростерон сульфат', 'дгэа-сульфат', 'дгэа-с', 'дэа-сульфат', 'дэа-so4', 'дэа-s', 'dhea-s', 'dhea-so4'] },
  ige: { aliases: ['иммуноглобулин e общий', 'иммуноглобулин e', 'общий ige', 'ige общий', 'ige'], exclude: ['специфич'] },
  rf: { aliases: ['ревматоидный фактор', 'rf'] },
  anti_tg: { aliases: ['антитела к тиреоглобулину', 'ат к тиреоглобулину', 'ат-тг', 'ат к тг', 'anti-tg', 'атг'] },
  anti_tpo: { aliases: ['антитела к тиреопероксидазе', 'антитела к тпо', 'ат к тиреопероксидазе', 'ат-тпо', 'ат к тпо', 'anti-tpo'] },
  tsh: { aliases: ['тиреотропный гормон', 'тиреотропный', 'ттг', 'tsh'] },
  t4_free: { aliases: ['тироксин свободный', 'свободный тироксин', 'т4 свободный', 'свободный т4', 'т4 св', 'ft4'] },
  alp: { aliases: ['щелочная фосфатаза', 'фосфатаза щелочная', 'щф', 'alp'] },
  cholesterol: {
    aliases: ['холестерин общий', 'общий холестерин', 'холестерол общий', 'общий холестерол', 'холестерин', 'холестерол', 'cholesterol'],
    exclude: ['лпвп', 'лпнп', 'лпонп', 'hdl', 'ldl', 'липопротеин', 'не-лп', 'неlп', 'атероген'],
  },
  hdl: { aliases: ['холестерин-лпвп', 'холестерол-лпвп', 'лпвп', 'липопротеины высокой плотности', 'hdl'] },
  ldl: { aliases: ['холестерин-лпнп', 'холестерол-лпнп', 'лпнп', 'липопротеины низкой плотности', 'ldl'], exclude: ['очень низкой', 'лпонп'] },
  creatinine: { aliases: ['креатинин', 'creatinine'], exclude: ['моч', 'клиренс', 'скф', 'киназ'] },
  urea: { aliases: ['мочевина', 'urea'], exclude: ['азот'] },
  uric_acid: { aliases: ['мочевая кислота', 'uric acid'] },
  bilirubin_total: { aliases: ['билирубин общий', 'общий билирубин'] },
  bilirubin_direct: { aliases: ['билирубин прямой', 'прямой билирубин', 'билирубин связанный', 'связанный билирубин'] },
  ast: { aliases: ['аспартатаминотрансфераза', 'аспартатаминотрансфераза', 'асат', 'аст', 'ast'] },
  alt: { aliases: ['аланинаминотрансфераза', 'алат', 'алт', 'alt'] },
  ggt: { aliases: ['гамма-глутамилтранспептидаза', 'гамма-глутамилтрансфераза', 'гамма-гт', 'ггтп', 'ггт', 'ggt'] },
  triglycerides: { aliases: ['триглицериды', 'триглицерид', 'triglycerides'] },
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETTER = 'a-zа-я';
type Compiled = { id: string; re: RegExp; len: number; exclude: string[] };

const COMPILED: Compiled[] = Object.entries(ALIASES).flatMap(([id, r]) =>
  r.aliases.map((a) => {
    // пробелы и дефисы в названии — любые разделители; по краям — не буква (чтобы «железо» не нашлось в «железосвязывающая»)
    const body = norm(a)
      .split(/[\s-]+/)
      .map(escape)
      .join('[\\s\\-–—.,]*');
    return { id, re: new RegExp(`(?<![${LETTER}])${body}(?![${LETTER}])`), len: a.length, exclude: (r.exclude ?? []).map(norm) };
  }),
);

/* ---------- Единицы ---------- */

/** Нормализованная единица: «мкмоль/л», «µmol/L», «umol/l» → «мкмоль/л». */
export function unitKey(raw: string): string | null {
  const u = raw
    .toLowerCase()
    .replace(/[µμ]/g, 'мк')
    .replace(/\s+/g, '')
    .replace(/[.,;:)]+$/, '');
  const map: [RegExp, string][] = [
    [/^(ммоль|mmol)\/?(л|l)$/, 'ммоль/л'],
    [/^(мкмоль|umol|мкmol)\/?(л|l)$/, 'мкмоль/л'],
    [/^(нмоль|nmol)\/?(л|l)$/, 'нмоль/л'],
    [/^(пмоль|pmol)\/?(л|l)$/, 'пмоль/л'],
    [/^(г|g)\/(л|l)$/, 'г/л'],
    [/^(г|g)\/(дл|dl)$/, 'г/дл'],
    [/^(мг|mg)\/(л|l)$/, 'мг/л'],
    [/^(мг|mg)\/(дл|dl)$/, 'мг/дл'],
    [/^(мкг|ug|мкg)\/(л|l)$/, 'мкг/л'],
    [/^(мкг|ug|мкg)\/(дл|dl)$/, 'мкг/дл'],
    [/^(нг|ng)\/(мл|ml)$/, 'нг/мл'],
    [/^(нг|ng)\/(л|l)$/, 'нг/л'],
    [/^(пг|pg)\/(мл|ml)$/, 'пг/мл'],
    [/^(ед|u|ме|iu|me)\/(л|l)$/, 'ед/л'],
    [/^(ед|u|ме|iu|me|ме)\/(мл|ml)$/, 'ме/мл'],
    [/^(кме|kiu|кед)\/(л|l)$/, 'ме/мл'],
    [/^(мме|miu|мед)\/(л|l)$/, 'мме/л'],
    [/^(мкме|uiu|мкед)\/(мл|ml)$/, 'мме/л'],
    [/^(мме|miu|мед)\/(мл|ml)$/, 'ед/л'],
    [/^%$/, '%'],
  ];
  for (const [re, k] of map) if (re.test(u)) return k;
  return null;
}

/** Перевод из единицы бланка в единицу приложения (множитель). */
const CONVERT: Record<string, Record<string, number>> = {
  glucose: { 'мг/дл': 1 / 18.016 },
  cholesterol: { 'мг/дл': 1 / 38.67 },
  hdl: { 'мг/дл': 1 / 38.67 },
  ldl: { 'мг/дл': 1 / 38.67 },
  triglycerides: { 'мг/дл': 1 / 88.57 },
  creatinine: { 'мг/дл': 88.4 },
  uric_acid: { 'мг/дл': 59.48 },
  bilirubin_total: { 'мг/дл': 17.1 },
  bilirubin_direct: { 'мг/дл': 17.1 },
  iron: { 'мкг/дл': 0.179 },
  calcium: { 'мг/дл': 0.2495 },
  magnesium: { 'мг/дл': 0.4114 },
  phosphorus: { 'мг/дл': 0.3229 },
  protein: { 'г/дл': 10 },
  zinc: { 'мкмоль/л': 0.06538 },
  selenium: { 'мкмоль/л': 0.07896 },
  vit_a: { 'мкмоль/л': 0.2865 },
  vit_c: { 'мкмоль/л': 0.1761 },
  vit_d: { 'нмоль/л': 1 / 2.496 },
  b12: { 'пмоль/л': 1.355 },
  folate: { 'нмоль/л': 1 / 2.266 },
  cortisol: { 'мкг/дл': 27.59 },
  testosterone_free: { 'пмоль/л': 1 / 3.467 },
  prolactin: { 'нг/мл': 21.2 },
  estradiol: { 'пг/мл': 3.671 },
  dhea_s: { 'мкг/дл': 0.02714 },
};

/** Единицы, которые означают одно и то же. */
const SAME: Record<string, string> = { 'мкг/л': 'нг/мл', 'нг/л': 'пг/мл', 'мкме/мл': 'мме/л', 'ме/л': 'ед/л' };
const canon = (u: string) => SAME[u] ?? u;

/* ---------- Разбор ---------- */

export type Found = {
  indicatorId: string;
  value: number;
  comparator: '=' | '<' | '>';
  /** Строка бланка, из которой взято значение */
  line: string;
  /** Надо проверить: распознавание могло ошибиться */
  check: boolean;
  note?: string;
};

const NUM = /^([<>≤≥]?)(\d+(?:[.,]\d+)?)$/;
const isUnitish = (t: string) => /[/%]/.test(t) || unitKey(t) !== null;
const round = (x: number) => Math.round(x * 1000) / 1000;

/** Широкая рамка для проверки правдоподобия: обе нормы по полу, если пол неизвестен. */
function plausibleRange(ind: Indicator): Range | null {
  const rs = [ind.norm, ind.female === 'cycle' ? undefined : ind.female, ind.male].filter(Boolean) as Range[];
  if (!rs.length) return null;
  const los = rs.map((r) => r.lo).filter((x): x is number => x !== undefined);
  const his = rs.map((r) => r.hi).filter((x): x is number => x !== undefined);
  return { lo: los.length ? Math.min(...los) : undefined, hi: his.length ? Math.max(...his) : undefined };
}

function plausible(v: number, r: Range): boolean {
  const hi = r.hi ?? (r.lo ?? 1) * 20;
  const lo = r.lo ? r.lo / 8 : 0;
  return v <= hi * 4 && v >= lo;
}

/** Насколько значение далеко от нормы (в разах, по логарифму); 0 — внутри нормы. */
function distance(v: number, r: Range): number {
  const x = Math.max(v, 1e-6);
  let out = 0;
  if (r.lo !== undefined && x < r.lo) out = Math.log(r.lo / x);
  if (r.hi !== undefined && x > r.hi) out = Math.log(x / r.hi);
  // при равенстве — ближе к «середине» нормы (для односторонней нормы «> 1» это около 1,5)
  const center = r.lo !== undefined && r.hi !== undefined ? Math.sqrt(Math.max(r.lo, 1e-3) * r.hi) : r.lo !== undefined ? r.lo * 1.5 : (r.hi ?? 1) / 2;
  return out * 10 + Math.abs(Math.log(x / center));
}

/** Расстояние Левенштейна: сколько букв надо поправить, чтобы слова совпали. */
function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

type Fuzzy = { id: string; words: string[]; len: number; exclude: string[] };
/** Для нестрогого сравнения — только длинные названия: короткие сокращения (АЛТ, ЛГ) легко спутать. */
const FUZZY: Fuzzy[] = Object.entries(ALIASES).flatMap(([id, r]) =>
  r.aliases
    .map((a) => norm(a).replace(/[^a-zа-я0-9\s]/g, ' ').split(/\s+/).filter(Boolean))
    .filter((w) => w.join('').length >= 7 && w.every((x) => /^[а-я]+$/.test(x)))
    .map((words) => ({ id, words, len: words.join(' ').length, exclude: (r.exclude ?? []).map(norm) })),
);

/** Нестрогий поиск: название прочитано с ошибками («Билирубим общий», «Креотимин»). */
function fuzzyLine(n: string): { id: string; end: number } | null {
  const words = [...n.matchAll(/[a-zа-я]+/g)].map((m) => ({ w: m[0], end: m.index! + m[0].length }));
  let best: { id: string; end: number; cost: number; len: number } | null = null;
  for (const f of FUZZY) {
    if (f.exclude.some((x) => n.includes(x))) continue;
    for (let i = 0; i + f.words.length <= words.length && i < 4; i++) {
      const got = words.slice(i, i + f.words.length).map((x) => x.w).join(' ');
      const cost = lev(got, f.words.join(' '));
      if (cost > Math.floor(f.len / 6) || cost === 0) continue;
      if (!best || f.len - cost * 3 > best.len - best.cost * 3) best = { id: f.id, end: words[i + f.words.length - 1].end, cost, len: f.len };
    }
  }
  return best ? { id: best.id, end: best.end } : null;
}

/** Ищет показатель в строке: самое длинное совпавшее название. */
function matchLine(n: string): { c: Compiled; end: number } | null {
  let best: { c: Compiled; end: number; start: number } | null = null;
  for (const c of COMPILED) {
    if (c.exclude.some((x) => n.includes(x))) continue;
    const m = c.re.exec(n);
    if (!m) continue;
    if (!best || c.len > best.c.len || (c.len === best.c.len && m.index < best.start)) best = { c, end: m.index + m[0].length, start: m.index };
  }
  return best;
}

/** Значение после названия: первое число, пока не начались единицы; диапазон «4,1 - 5,9» — это норма, не результат. */
function valueAfter(rest: string): { raw: string; comparator: '=' | '<' | '>'; value: number; clean: boolean; unit: string | null } | null {
  // пояснения в скобках («(HbA1c)», «(тиреотропный гормон)») и хвост закрывающей скобки
  let r = rest.replace(/\([^)]*\)/g, ' ');
  // скобка прочиталась криво («{HbA1c)») — отрезаем короткий хвост до «)»
  if (/^[^()]{0,16}\)/.test(r)) r = r.replace(/^[^()]{0,16}\)/, ' ');
  r = r.replace(/([<>≤≥])\s+(\d)/g, '$1$2');
  const tokens = r.split(/[\s|]+/).filter(Boolean);
  let skipped = 0;
  for (let i = 0; i < tokens.length && i < 6; i++) {
    const t = tokens[i].replace(/[*;:]+$/, '');
    const m = NUM.exec(t);
    if (m) {
      const next = tokens[i + 1] ?? '';
      if (/^[-–—]/.test(next) || /^[-–—]\d/.test(next)) return null; // начало диапазона нормы
      const cmp = m[1] === '<' || m[1] === '≤' ? '<' : m[1] === '>' || m[1] === '≥' ? '>' : '=';
      const unit = tokens[i + 1] ? unitKey(tokens[i + 1]) : null;
      return { raw: m[2], comparator: cmp, value: Number(m[2].replace(',', '.')), clean: skipped === 0, unit };
    }
    if (/\d+[.,]?\d*\s*[-–—]\s*\d/.test(t)) return null;
    if (isUnitish(t)) return null; // дошли до единиц, а числа не было — результат не прочитался
    if (!/^[a-zа-яё.\-–]+$/i.test(t)) return null;
    skipped++;
  }
  return null;
}

/** Разбор текста бланка. Первое найденное значение показателя побеждает. */
export function parseBlank(text: string): Found[] {
  const out = new Map<string, Found>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line.length < 3) continue;
    const n = norm(line);
    const exact = matchLine(n);
    const fuzzy = exact ? null : fuzzyLine(n);
    const hit = exact ? { id: exact.c.id, end: exact.end } : fuzzy;
    if (!hit || out.has(hit.id)) continue;
    const v = valueAfter(line.slice(hit.end));
    if (!v || !Number.isFinite(v.value)) continue;
    const ind = CATALOG.find((i) => i.id === hit.id)!;
    const f: Found = { indicatorId: ind.id, value: v.value, comparator: v.comparator, line: line.slice(0, 140), check: !v.clean || !!fuzzy };
    if (fuzzy) f.note = 'Название прочитано неточно';
    else if (!v.clean) f.note = 'Между названием и числом был непонятный текст';

    // единицы
    if (v.unit) {
      const target = unitKey(ind.unit);
      if (target && canon(v.unit) !== canon(target)) {
        const k = CONVERT[ind.id]?.[v.unit];
        if (k) {
          f.value = round(f.value * k);
          f.check = true;
          f.note = `Переведено из ${v.unit} в ${ind.unit}`;
        } else {
          f.check = true;
          f.note = `В бланке ${v.unit}, в приложении ${ind.unit} — проверьте`;
        }
      }
    }

    // правдоподобие: чаще всего распознавание теряет запятую («5,6» → «56»)
    const r = plausibleRange(ind);
    if (r && f.comparator === '=' && !plausible(f.value, r)) {
      // из вариантов «÷10» и «÷100» берём ближайший к норме
      const fixed = [10, 100]
        .map((d) => round(f.value / d))
        .filter((x) => plausible(x, r))
        .sort((a, b) => distance(a, r) - distance(b, r))[0];
      if (fixed !== undefined && !/[.,]/.test(v.raw)) {
        f.note = `Прочитано «${v.raw}» — похоже, потерялась запятая`;
        f.value = fixed;
      } else f.note = f.note ?? 'Необычное значение для этого показателя';
      f.check = true;
    }
    out.set(ind.id, f);
  }
  return [...out.values()];
}

/* ---------- Шаги со скриншота ---------- */

const STEP_WORD = /шаг|steps?\b/i;
const NOT_STEPS = /цел|goal|км|km|ккал|kcal|кал|мин|min|этаж|floor|час|ч\b|м\b|сред|avg|average|недел|week|мес/i;

/** Число шагов со скриншота шагомера. Ищем число рядом со словом «шаги», не цель и не километры. */
export function parseSteps(text: string): { steps: number | null; candidates: number[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const scored: { n: number; score: number }[] = [];
  lines.forEach((line, i) => {
    // «8 345», «8,345», «8.345», «8345»
    for (const m of line.matchAll(/(?<![\d.,])(\d{1,3}(?:[  .,]\d{3})+|\d{2,6})(?![\d])/g)) {
      const n = Number(m[1].replace(/[  .,]/g, ''));
      if (n < 50 || n > 100_000) continue;
      let score = 0;
      if (STEP_WORD.test(line)) score += 10;
      if (STEP_WORD.test(lines[i - 1] ?? '') || STEP_WORD.test(lines[i + 1] ?? '')) score += 6;
      if (NOT_STEPS.test(line)) score -= 8;
      if (/[  .,]\d{3}$/.test(m[1])) score += 2; // разряды через пробел — так пишут шаги
      if (/:/.test(line)) score -= 3; // время
      scored.push({ n, score });
    }
  });
  scored.sort((a, b) => b.score - a.score || b.n - a.n);
  const candidates = [...new Set(scored.map((s) => s.n))].slice(0, 5);
  const best = scored[0];
  return { steps: best && best.score > 0 ? best.n : null, candidates };
}
