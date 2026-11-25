/**
 * Отправка кодов входа. По умолчанию — в журнал сервера (локальный тест).
 * SMS: Mobizon (api.mobizon.kz). Почта: любой SMTP.
 */
import nodemailer, { type Transporter } from 'nodemailer';

import type { Config } from '../config.js';

export interface Messenger {
  sendSms(phone: string, text: string): Promise<void>;
  sendEmail(to: string, subject: string, text: string): Promise<void>;
}

type Log = { info: (o: object, m?: string) => void };

export function createMessenger(cfg: Config, log: Log): Messenger {
  let transport: Transporter | null = null;
  return {
    async sendSms(phone, text) {
      if (cfg.sms.provider === 'console') {
        log.info({ phone, text }, 'SMS (тестовый режим, не отправлено)');
        return;
      }
      await sendMobizon(cfg, phone, text);
    },
    async sendEmail(to, subject, text) {
      if (cfg.email.provider === 'console') {
        log.info({ to, subject, text }, 'E-mail (тестовый режим, не отправлено)');
        return;
      }
      if (!cfg.email.smtpUrl) throw new Error('Не задан SMTP_URL');
      transport ??= nodemailer.createTransport(cfg.email.smtpUrl);
      await transport.sendMail({ from: cfg.email.from, to, subject, text });
    },
  };
}

/**
 * Формат запроса взят из официальной библиотеки mobizon-php (MobizonApi::call):
 * POST https://<server>/service/message/sendsmsmessage?api=v1&apiKey=…&output=json,
 * тело x-www-form-urlencoded: recipient, text, from (необязательно).
 * Успех — code 0 или 100.
 */
async function sendMobizon(cfg: Config, phone: string, text: string) {
  if (!cfg.sms.mobizonApiKey) throw new Error('Не задан MOBIZON_API_KEY');
  const url = new URL('/service/message/sendsmsmessage', cfg.sms.mobizonApiUrl);
  url.search = new URLSearchParams({ api: 'v1', apiKey: cfg.sms.mobizonApiKey, output: 'json' }).toString();
  const body = new URLSearchParams({ recipient: phone.replace(/\D/g, ''), text });
  if (cfg.sms.sender) body.set('from', cfg.sms.sender);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
  if (!json || (json.code !== 0 && json.code !== 100)) {
    throw new Error(`Mobizon: ошибка отправки (${json?.code ?? res.status}) ${json?.message ?? ''}`.trim());
  }
}
