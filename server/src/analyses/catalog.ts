/**
 * Панель анализов: 46 показателей, нормы и единицы — из презентации проекта
 * (экраны «Панель анализов» и «Проверка распознанного»).
 * ВАЖНО: медицинские референсы перед пилотом проверяет врач.
 * Норма: lo/hi (любая может отсутствовать: «< 30» = только hi, «> 1» = только lo).
 * byCycle — у женщин норма зависит от фазы цикла: автоматически не оцениваем.
 */
export type Range = { lo?: number; hi?: number };
export type Sex = 'female' | 'male';
export type Indicator = {
  id: string;
  group: string;
  name: string;
  unit: string;
  norm?: Range;
  female?: Range | 'cycle';
  male?: Range;
};

export const GROUPS = ['Метаболизм и белки', 'Микроэлементы и витамины', 'Гормоны и иммунитет', 'Щитовидная железа', 'Биохимия и липиды'] as const;

const g = (group: number, id: string, name: string, unit: string, extra: Omit<Indicator, 'id' | 'group' | 'name' | 'unit'>): Indicator => ({
  id,
  group: GROUPS[group],
  name,
  unit,
  ...extra,
});

export const CATALOG: Indicator[] = [
  g(0, 'ldh', 'ЛДГ (лактатдегидрогеназа)', 'Ед/л', { norm: { lo: 125, hi: 220 } }),
  g(0, 'hba1c', 'Гликированный гемоглобин', '%', { norm: { lo: 0, hi: 5 } }),
  g(0, 'glucose', 'Глюкоза', 'ммоль/л', { norm: { lo: 4.1, hi: 6 } }),
  g(0, 'protein', 'Общий белок', 'г/л', { norm: { lo: 64, hi: 83 } }),
  g(0, 'crp', 'С-реактивный белок', 'мг/л', { norm: { lo: 0, hi: 5 } }),

  g(1, 'iron', 'Железо в сыворотке', 'мкмоль/л', { norm: { lo: 10.7, hi: 28.6 } }),
  g(1, 'ferritin', 'Ферритин', 'мкг/л', { norm: { lo: 22, hi: 275 } }),
  g(1, 'transferrin', 'Трансферрин', 'г/л', { norm: { lo: 2.15, hi: 3.66 } }),
  g(1, 'calcium', 'Кальций общий', 'ммоль/л', { norm: { lo: 2.15, hi: 2.5 } }),
  g(1, 'vit_a', 'Витамин A в сыворотке', 'мг/л', { norm: { lo: 0.3, hi: 0.8 } }),
  g(1, 'vit_c', 'Витамин C в плазме', 'мг/л', { norm: { lo: 4, hi: 15 } }),
  g(1, 'zinc', 'Цинк, сыворотка', 'мг/л', { norm: { lo: 0.75, hi: 1.5 } }),
  g(1, 'selenium', 'Селен, цельная кровь', 'мг/л', { norm: { lo: 0.1, hi: 0.2 } }),
  g(1, 'vit_d', '25-OH витамин D', 'нг/мл', { norm: { lo: 60, hi: 100 } }),
  g(1, 'folate', 'Фолиевая кислота', 'нг/мл', { norm: { lo: 3.1, hi: 20.5 } }),
  g(1, 'phosphorus', 'Фосфор неорганический', 'ммоль/л', { norm: { lo: 0.87, hi: 1.45 } }),
  g(1, 'iodine', 'Йод в сыворотке', 'мг/л', { norm: { lo: 0.05, hi: 0.1 } }),
  g(1, 'magnesium', 'Магний', 'ммоль/л', { norm: { lo: 0.85, hi: 1.15 } }),
  g(1, 'b12', 'Витамин B12', 'пг/мл', { norm: { lo: 187, hi: 883 } }),

  g(2, 'testosterone_free', 'Тестостерон свободный', 'пг/мл', { female: { lo: 1, hi: 1.7 }, male: { lo: 8.9, hi: 42 } }),
  g(2, 'cortisol', 'Кортизол', 'нмоль/л', { norm: { lo: 100, hi: 400 } }),
  g(2, 'prolactin', 'Пролактин', 'мМЕ/л', { norm: { lo: 73, hi: 300 } }),
  g(2, 'estradiol', 'Эстрадиол (Э2)', 'пмоль/л', { female: 'cycle', male: { lo: 40, hi: 160 } }),
  g(2, 'fsh', 'Фолликулостимулирующий гормон (ФСГ)', 'мМЕ/мл', { female: 'cycle', male: { lo: 0.95, hi: 11.95 } }),
  g(2, 'shbg', 'Глобулин, связывающий половые гормоны (ГСПГ)', 'нмоль/л', { norm: { lo: 18, hi: 135 } }),
  g(2, 'lh', 'Лютеинизирующий гормон (ЛГ)', 'мМЕ/мл', { female: 'cycle', male: { lo: 0.57, hi: 12.07 } }),
  g(2, 'dhea_s', 'Дегидроэпиандростерон-сульфат (ДЭА-SO4)', 'мкмоль/л', { norm: { lo: 2.2, hi: 15.2 } }),
  g(2, 'ige', 'Иммуноглобулин E общий', 'МЕ/мл', { female: { lo: 0, hi: 87 }, male: { lo: 0, hi: 100 } }),
  g(2, 'rf', 'Ревматоидный фактор', 'МЕ/мл', { norm: { hi: 30 } }),

  g(3, 'anti_tg', 'Антитела к тиреоглобулину (АТ-ТГ)', 'МЕ/мл', { norm: { lo: 20, hi: 120 } }),
  g(3, 'anti_tpo', 'Антитела к тиреопероксидазе (АТ-ТПО)', 'МЕ/мл', { norm: { hi: 5.6 } }),
  g(3, 'tsh', 'Тиреотропный гормон (ТТГ)', 'мкМЕ/мл', { norm: { lo: 0.4, hi: 4 } }),
  g(3, 't4_free', 'Тироксин свободный (Т4 свободный)', 'пмоль/л', { norm: { lo: 9, hi: 19.05 } }),

  g(4, 'alp', 'Фосфатаза щелочная', 'Ед/л', { norm: { lo: 40, hi: 150 } }),
  g(4, 'cholesterol', 'Холестерол общий', 'ммоль/л', { norm: { lo: 2.93, hi: 5.1 } }),
  g(4, 'hdl', 'Холестерол-ЛПВП', 'ммоль/л', { norm: { lo: 1 } }),
  g(4, 'ldl', 'Холестерол-ЛПНП', 'ммоль/л', { female: { hi: 3 }, male: { lo: 1.61, hi: 3.37 } }),
  g(4, 'creatinine', 'Креатинин', 'мкмоль/л', { female: { lo: 49, hi: 90 }, male: { lo: 71, hi: 115 } }),
  g(4, 'urea', 'Мочевина', 'ммоль/л', { norm: { lo: 2.5, hi: 6.4 } }),
  g(4, 'uric_acid', 'Мочевая кислота', 'мкмоль/л', { norm: { lo: 210, hi: 420 } }),
  g(4, 'bilirubin_total', 'Билирубин общий', 'мкмоль/л', { norm: { lo: 3.4, hi: 20.5 } }),
  g(4, 'bilirubin_direct', 'Билирубин прямой', 'мкмоль/л', { norm: { hi: 8.6 } }),
  g(4, 'ast', 'АсАТ (аспартатаминотрансфераза)', 'Ед/л', { norm: { hi: 37 } }),
  g(4, 'alt', 'АлАТ (аланинаминотрансфераза)', 'Ед/л', { norm: { hi: 41 } }),
  g(4, 'ggt', 'Гамма-глутамилтранспептидаза (ГГТ)', 'Ед/л', { norm: { hi: 49 } }),
  g(4, 'triglycerides', 'Триглицериды', 'ммоль/л', { norm: { lo: 0.45, hi: 1.81 } }),
];

export const BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

/** Норма для участника: общая, по полу; null — оценивает модератор (не указан пол или фаза цикла). */
export function normFor(ind: Indicator, sex: Sex | null): Range | null {
  if (ind.norm) return ind.norm;
  if (!sex) return null;
  const r = sex === 'female' ? ind.female : ind.male;
  return r && r !== 'cycle' ? r : null;
}

export function normLabel(r: Range | null, ind: Indicator, sex: Sex | null): string {
  const n = (x: number) => String(x).replace('.', ',');
  if (r) {
    if (r.lo !== undefined && r.hi !== undefined) return `${n(r.lo)} – ${n(r.hi)}`;
    if (r.hi !== undefined) return `< ${n(r.hi)}`;
    if (r.lo !== undefined) return `> ${n(r.lo)}`;
  }
  if (!ind.norm && !sex) return 'норма зависит от пола';
  return 'по фазе цикла — оценивает модератор';
}

export type Status = 'normal' | 'border' | 'low' | 'high' | 'unknown';

/** Статус значения: «у границы» — в норме, но в крайних 10% диапазона (или 90–100% верхней границы). */
export function statusOf(value: number, r: Range | null): Status {
  if (!r) return 'unknown';
  if (r.lo !== undefined && value < r.lo) return 'low';
  if (r.hi !== undefined && value > r.hi) return 'high';
  if (r.lo !== undefined && r.hi !== undefined) {
    const edge = (r.hi - r.lo) * 0.1;
    return value <= r.lo + edge || value >= r.hi - edge ? 'border' : 'normal';
  }
  if (r.hi !== undefined) return value >= r.hi * 0.9 ? 'border' : 'normal';
  if (r.lo !== undefined) return value <= r.lo * 1.1 ? 'border' : 'normal';
  return 'normal';
}

/** Балл показателя 0..1: в норме — 1, за нормой — плавно падает до 0 на отклонении в ширину нормы. */
export function scoreOf(value: number, r: Range | null): number | null {
  if (!r) return null;
  const width = r.lo !== undefined && r.hi !== undefined ? r.hi - r.lo : (r.hi ?? r.lo ?? 1);
  let d = 0;
  if (r.lo !== undefined && value < r.lo) d = r.lo - value;
  if (r.hi !== undefined && value > r.hi) d = value - r.hi;
  return Math.max(0, 1 - d / (width || 1));
}

/* ---------- Нормы потока: модератор может поменять норму или выключить показатель ---------- */

export type Override = { off?: boolean; norm?: Range; female?: Range; male?: Range };
export type Overrides = Record<string, Override>;

/** Показатель с нормами потока поверх общих. */
export function withOverride(ind: Indicator, ov: Override | undefined): Indicator {
  if (!ov) return ind;
  if (ind.norm) return ov.norm ? { ...ind, norm: ov.norm } : ind;
  return { ...ind, female: ov.female ?? ind.female, male: ov.male ?? ind.male };
}

/** Каталог потока: нормы модератора применены, выключенные показатели убраны. */
export function streamCatalog(overrides: unknown): Indicator[] {
  const o = (overrides ?? {}) as Overrides;
  return CATALOG.filter((i) => !o[i.id]?.off).map((i) => withOverride(i, o[i.id]));
}
