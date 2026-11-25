import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name: string): string {
  const v = env[name];
  if (!v) throw new Error(`Не задана переменная окружения ${name}`);
  return v;
}

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(overrides: Partial<Record<string, string>> = {}) {
  const get = (k: string) => overrides[k] ?? env[k];
  const prod = (overrides.NODE_ENV ?? env.NODE_ENV) === 'production';
  const jwtSecret = get('JWT_SECRET') ?? (prod ? required('JWT_SECRET') : 'dev-secret-не-использовать-на-сервере-0123456789');
  if (prod && jwtSecret.length < 32) throw new Error('JWT_SECRET должен быть не короче 32 символов');
  const devCodes = get('DEV_RETURN_CODES') ?? (prod ? 'false' : 'true');
  if (prod && devCodes === 'true') throw new Error('DEV_RETURN_CODES нельзя включать в production');

  return {
    isProd: prod,
    port: Number(get('PORT') ?? 3000),
    host: get('HOST') ?? '0.0.0.0',
    databaseUrl: get('DATABASE_URL'),
    dataDir: get('DATA_DIR') ?? path.resolve('data'),
    /** Голосовые заявления и другие файлы участников */
    uploadDir: get('UPLOAD_DIR') ?? path.join(get('DATA_DIR') ?? path.resolve('data'), 'uploads'),
    jwtSecret,
    accessTtlSec: 15 * 60,
    refreshTtlDays: 60,
    otpTtlMin: 10,
    otpMaxAttempts: 5,
    /** Вернуть код входа в ответе API — только для локального теста без SMS. */
    devReturnCodes: devCodes === 'true',
    sms: {
      provider: (get('SMS_PROVIDER') ?? 'console') as 'console' | 'mobizon',
      mobizonApiKey: get('MOBIZON_API_KEY'),
      mobizonApiUrl: get('MOBIZON_API_URL') ?? 'https://api.mobizon.kz',
      sender: get('SMS_SENDER'),
    },
    email: {
      provider: (get('EMAIL_PROVIDER') ?? 'console') as 'console' | 'smtp',
      smtpUrl: get('SMTP_URL'),
      from: get('EMAIL_FROM') ?? 'Кактус <no-reply@kaktus.kz>',
    },
    push: { enabled: (get('PUSH_ENABLED') ?? 'false') === 'true' },
  };
}

export { isProd };
