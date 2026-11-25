/** Пуш-уведомления через сервис Expo. Текст уведомлений не содержит медицинских данных. */
import type { Config } from './config.js';
import type { Db } from './db/index.js';

export interface Push {
  notifyUser(userId: string, title: string, body: string, data?: Record<string, unknown>): Promise<void>;
}

type Log = { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };

export function createPush(db: Db, cfg: Config, log: Log): Push {
  return {
    async notifyUser(userId, title, body, data) {
      const tokens = await db.query<{ token: string }>('select token from push_tokens where user_id = $1', [userId]);
      if (!tokens.length) return;
      // Канал 'default' создаёт приложение с высокой важностью — Android показывает уведомление сразу
      const messages = tokens.map((t) => ({ to: t.token, title, body, data, sound: 'default', channelId: 'default', priority: 'high' }));
      if (!cfg.push.enabled) {
        log.info({ userId, title, body }, 'Пуш (выключено PUSH_ENABLED, не отправлено)');
        return;
      }
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(10_000),
        });
        const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
        // Токены удалённых приложений больше не действуют — убираем их
        const dead = (json?.data ?? [])
          .map((r, i) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
          .filter((t): t is string => !!t);
        if (dead.length) await db.query('delete from push_tokens where token = any($1)', [dead]);
      } catch (e) {
        log.warn({ err: String(e) }, 'Не удалось отправить пуш');
      }
    },
  };
}
