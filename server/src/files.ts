/**
 * Файлы участников (голосовые заявления) на диске сервера, в Казахстане.
 * Путь в базе — относительный, от UPLOAD_DIR.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Допустимые форматы записи: iOS/Android пишут m4a (AAC), браузер — webm. */
export const AUDIO_TYPES: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/3gpp': '3gp',
};
/** Бланки анализов: фото и PDF. */
export const BLANK_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const SERVE_TYPE: Record<string, string> = {
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  mp3: 'audio/mpeg',
  '3gp': 'audio/3gpp',
  jpg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export class FileStore {
  constructor(private root: string) {}

  private abs(rel: string): string {
    const p = path.resolve(this.root, rel);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error('bad path');
    return p;
  }

  /**
   * Голосовое любой длины: пишем на диск по мере поступления, не держа файл в памяти.
   * Больше maxBytes — обрываем и удаляем недописанный файл.
   */
  async saveVoiceStream(membershipId: string, date: string, ext: string, body: Readable, maxBytes: number): Promise<{ rel: string; bytes: number }> {
    const rel = path.join('voice', membershipId, `${date}-${randomBytes(6).toString('hex')}.${ext}`);
    const abs = this.abs(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    let bytes = 0;
    let over = false;
    // После предела дочитываем запрос вхолостую (не пишем на диск), чтобы клиент получил понятный ответ
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (bytes > maxBytes) over = true;
        if (over) cb();
        else cb(null, chunk);
      },
    });
    try {
      await pipeline(body, limit, createWriteStream(abs));
    } catch (e) {
      await rm(abs, { force: true });
      throw e;
    }
    if (over) {
      await rm(abs, { force: true });
      throw Object.assign(new Error('too large'), { code: 'TOO_LARGE' });
    }
    return { rel, bytes };
  }

  async saveVoice(membershipId: string, date: string, ext: string, data: Buffer): Promise<string> {
    const rel = path.join('voice', membershipId, `${date}-${randomBytes(6).toString('hex')}.${ext}`);
    const abs = this.abs(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data);
    return rel;
  }

  async saveBlank(membershipId: string, ext: string, data: Buffer): Promise<string> {
    const rel = path.join('blanks', membershipId, `${randomBytes(8).toString('hex')}.${ext}`);
    const abs = this.abs(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data);
    return rel;
  }

  async remove(rel: string | null | undefined) {
    if (rel) await rm(this.abs(rel), { force: true });
  }

  async removeMembership(membershipId: string) {
    for (const dir of ['voice', 'blanks']) {
      await rm(this.abs(path.join(dir, membershipId)), { recursive: true, force: true });
    }
  }

  async exists(rel: string): Promise<boolean> {
    return stat(this.abs(rel)).then(() => true, () => false);
  }

  open(rel: string) {
    const ext = path.extname(rel).slice(1);
    return { stream: createReadStream(this.abs(rel)), type: SERVE_TYPE[ext] ?? 'application/octet-stream' };
  }
}
