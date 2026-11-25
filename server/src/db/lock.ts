/**
 * Встроенную базу (PGlite) нельзя открывать из двух процессов одновременно.
 * Сервер оставляет файл с номером процесса; команда admin проверяет его.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const lockPath = (dir: string) => path.join(dir, 'server.pid');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function holdLock(dir: string) {
  writeFileSync(lockPath(dir), String(process.pid));
  const release = () => rmSync(lockPath(dir), { force: true });
  process.on('exit', release);
  return release;
}

export function assertNotLocked(dir: string) {
  const p = lockPath(dir);
  if (!existsSync(p)) return;
  const pid = Number(readFileSync(p, 'utf8'));
  if (pid && pid !== process.pid && alive(pid)) {
    throw new Error('Сервер сейчас запущен и использует встроенную базу. Остановите его (Ctrl+C), выполните команду и запустите снова.');
  }
}
