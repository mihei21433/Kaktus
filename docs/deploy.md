# Развёртывание на сервере (VPS в Казахстане)

Результат: сервер по адресу `https://api.ваш-домен.kz`, база PostgreSQL на том же VPS,
HTTPS-сертификат выпускается автоматически, ежедневные копии базы.

## Что подготовить

1. **VPS**: Ubuntu 24.04, 2 vCPU, 4 ГБ RAM, 50+ ГБ NVMe, расположение — Казахстан
   (Hoster.kz, PS.kz). Включите у провайдера резервные копии/снимки диска.
2. **Домен** и в его DNS **A-запись** `api` → IP вашего VPS.
3. **Mobizon**: аккаунт, пополненный баланс, включённый API и ключ API.
4. **Почта для кодов** (если нужен вход по e-mail): SMTP-доступ почтового сервиса.

Пароли и ключи никому не пересылайте — вписывайте их только в файл `.env` на сервере.

## Шаги

Подключитесь к серверу (на Windows — в PowerShell или cmd):

```bash
ssh root@IP-вашего-сервера
```

Установите Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

Скачайте проект. Репозиторий закрытый — понадобится токен GitHub
(github.com → Settings → Developer settings → Fine-grained tokens, доступ «Contents: Read»
только к репозиторию Kaktus). Git спросит логин и токен вместо пароля:

```bash
git clone https://github.com/mihei21433/Kaktus /opt/kaktus
```

Настройте переменные:

```bash
cd /opt/kaktus/deploy && cp .env.example .env
```

Сгенерируйте два секрета и впишите их в `.env` (`POSTGRES_PASSWORD` и `JWT_SECRET`):

```bash
openssl rand -hex 32
```

```bash
nano .env
```

Заполните `API_DOMAIN`, `MOBIZON_API_KEY`, SMTP. Сохранить: `Ctrl+O`, Enter, выйти: `Ctrl+X`.

Запустите:

```bash
docker compose up -d --build
```

Проверьте (через минуту, пока выпускается сертификат):

```bash
curl https://api.vectorfamily.kz/health
```

Ответ `{"ok":true}` — сервер работает.

## Первый поток

```bash
docker compose exec api node dist/admin.js create-stream +77011234567 "Поток «Весна»" 90
```

Остальные команды — как в [local-run.md](local-run.md), но через
`docker compose exec api node dist/admin.js …`. Сервер останавливать не нужно.

## Резервные копии

```bash
crontab -e
```

Добавьте строку (копия каждую ночь в 03:15, хранится 14 дней в `/opt/kaktus/backups`):

```
15 3 * * * /opt/kaktus/deploy/backup.sh
```

Раз в неделю скачивайте копии к себе — копия на том же сервере не спасёт, если сервер пропадёт.

## Обновление

```bash
cd /opt/kaktus && git pull && cd deploy && docker compose up -d --build
```

Изменения базы применяются автоматически при запуске.

## Приложение для этого сервера

Адрес сервера задаётся в `mobile/eas.json`, сборка приложения — по [pilot.md](pilot.md).
