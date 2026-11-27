/**
 * Чтение текста с фото и PDF на нашем сервере: Tesseract (русский + английский) и poppler.
 * Ничего не уходит за пределы сервера. Распознавание тяжёлое для процессора, поэтому — по одному за раз.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';

const run = promisify(execFile);
const TIMEOUT = 90_000;
const MAX_PAGES = 6;

export class OcrError extends Error {
  constructor(
    public code: 'unsupported' | 'unavailable' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

/** Очередь: одновременно идёт одно распознавание, остальные ждут. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => {});
  return next;
}

let available: boolean | null = null;
export async function ocrAvailable(): Promise<boolean> {
  if (available === null) {
    try {
      const { stdout } = await run('tesseract', ['--list-langs'], { timeout: 10_000 });
      available = stdout.includes('rus');
    } catch {
      available = false;
    }
  }
  return available;
}

async function tesseract(png: string): Promise<string> {
  const { stdout } = await run('tesseract', [png, '-', '-l', 'rus+eng', '--psm', '6'], { timeout: TIMEOUT, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

/**
 * Подготовка снимка: поворот по EXIF, серый, увеличение мелких снимков (Tesseract любит ~300 dpi),
 * растяжение контраста. Без увеличения на фото с телефона теряются запятые: «5,6» читается как «55».
 */
async function prepare(input: Buffer | string, out: string) {
  const img = sharp(input, { failOn: 'none' }).rotate();
  const { width = 0 } = await img.metadata();
  let p = img.grayscale();
  if (width && width < 2200) p = p.resize({ width: Math.min(width * 3, 2600) });
  await p.normalise().png().toFile(out);
}

/** Текст картинки (jpg, png, webp). */
export function imageText(input: Buffer | string): Promise<string> {
  return serial(async () => {
    if (!(await ocrAvailable())) throw new OcrError('unavailable', 'Распознавание на сервере не настроено');
    const dir = await mkdtemp(path.join(tmpdir(), 'kaktus-ocr-'));
    try {
      const png = path.join(dir, 'page.png');
      try {
        await prepare(input, png);
      } catch {
        throw new OcrError('unsupported', 'Не получилось открыть картинку. Сфотографируйте в JPEG или загрузите PDF');
      }
      return await tesseract(png);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

/** Текст PDF: сначала текстовый слой (PDF из лаборатории), если его нет — распознаём страницы как картинки. */
export function pdfText(file: string): Promise<string> {
  return serial(async () => {
    try {
      const { stdout } = await run('pdftotext', ['-layout', '-l', String(MAX_PAGES), file, '-'], { timeout: TIMEOUT, maxBuffer: 8 * 1024 * 1024 });
      if ((stdout.match(/[а-яё]/gi) ?? []).length > 40) return stdout;
    } catch {
      // нет текстового слоя или битый файл — пробуем как скан
    }
    if (!(await ocrAvailable())) throw new OcrError('unavailable', 'Распознавание на сервере не настроено');
    const dir = await mkdtemp(path.join(tmpdir(), 'kaktus-ocr-'));
    try {
      try {
        // страница ~150 dpi, дальше — та же подготовка, что и для фото
        await run('pdftoppm', ['-scale-to-x', '1240', '-scale-to-y', '-1', '-gray', '-png', '-l', String(MAX_PAGES), file, path.join(dir, 'p')], { timeout: TIMEOUT });
      } catch {
        throw new OcrError('unsupported', 'Не получилось открыть PDF');
      }
      const pages = (await readdir(dir)).filter((f) => f.startsWith('p') && f.endsWith('.png')).sort();
      const parts: string[] = [];
      for (const pg of pages) {
        const ready = path.join(dir, `ready-${pg}`);
        await prepare(path.join(dir, pg), ready);
        parts.push(await tesseract(ready));
      }
      return parts.join('\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

/** Текст файла бланка по расширению. HEIC не читаем: нужен отдельный декодер. */
export async function fileText(file: string, ext: string): Promise<string> {
  if (ext === 'pdf') return pdfText(file);
  if (ext === 'heic') throw new OcrError('unsupported', 'Формат HEIC не распознаётся. Сфотографируйте бланк кнопкой «Камера» или загрузите PDF');
  return imageText(file);
}

/** Для тестов: записать буфер во временный файл. */
export async function withTempFile<T>(data: Buffer, ext: string, fn: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'kaktus-ocr-'));
  try {
    const f = path.join(dir, `in.${ext}`);
    await writeFile(f, data);
    return await fn(f);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
