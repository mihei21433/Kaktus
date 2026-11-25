#!/bin/sh
# Ежедневная копия базы. Добавьте в crontab (crontab -e):
#   15 3 * * * /opt/kaktus/deploy/backup.sh
# Копии хранятся 14 дней в /opt/kaktus/backups. Периодически скачивайте их к себе.
set -eu
cd "$(dirname "$0")"
mkdir -p ../backups
docker compose exec -T db pg_dump -U kaktus -d kaktus --format=custom > "../backups/kaktus-$(date +%F).dump"
find ../backups -name 'kaktus-*.dump' -mtime +14 -delete
