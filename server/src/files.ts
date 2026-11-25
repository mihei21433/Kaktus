/**
 * Файлы участников (голосовые заявления) на диске сервера, в Казахстане.
 * Путь в базе — относительный, от UPLOAD_DIR.
 */
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

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
const SERVE_TYPE: Record<string, string> = { m4a: 'audio/mp4', webm: 'audio/webm', mp3: 'audio/mpeg', '3gp': 'audio/3gpp' };

export class FileStore {
  constructor(private root: string) {}

  private abs(rel: string): string {
    const p = path.resolve(this.root, rel);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error('bad path');
    return p;
  }

  async saveVoice(membershipId: string, date: string, ext: string, data: Buffer): Promise<string> {
    const rel = path.join('voice', membershipId, `${date}-${randomBytes(6).toString('hex')}.${ext}`);
    const abs = this.abs(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data);
    return rel;
  }

  async remove(rel: string | null | undefined) {
    if (rel) await rm(this.abs(rel), { force: true });
  }

  async removeMembership(membershipId: string) {
    await rm(this.abs(path.join('voice', membershipId)), { recursive: true, force: true });
  }

  async exists(rel: string): Promise<boolean> {
    return stat(this.abs(rel)).then(() => true, () => false);
  }

  open(rel: string) {
    const ext = path.extname(rel).slice(1);
    return { stream: createReadStream(this.abs(rel)), type: SERVE_TYPE[ext] ?? 'application/octet-stream' };
  }
}
