#!/bin/sh
# Включает автообновление сервера и ежедневную резервную копию. Запустить один раз:
#   sh /opt/kaktus/deploy/install-auto-update.sh
set -eu
cd /opt/kaktus
# Репозиторий открытый — токен для скачивания не нужен (и не протухнет)
git remote set-url origin https://github.com/mihei21433/Kaktus.git
chmod +x deploy/auto-update.sh deploy/backup.sh
cat > /etc/cron.d/kaktus <<'CRON'
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/2 * * * * root /opt/kaktus/deploy/auto-update.sh >> /var/log/kaktus-update.log 2>&1
15 3 * * * root /opt/kaktus/deploy/backup.sh >> /var/log/kaktus-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/kaktus
echo "Автообновление включено. Сейчас обновлю сервер до последней проверенной версии…"
FORCE=1 /opt/kaktus/deploy/auto-update.sh
echo "Готово. Журнал обновлений: tail -f /var/log/kaktus-update.log"
