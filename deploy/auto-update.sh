#!/bin/sh
# Автообновление сервера «Кактуса». Запускается cron раз в 2 минуты (ставит install-auto-update.sh).
# Следит за веткой production на GitHub: туда попадает только код, прошедший автотесты.
# Перед обновлением делает резервную копию базы. Журнал: /var/log/kaktus-update.log
# Вся логика — в функции: git может заменить этот файл прямо во время работы.
main() {
  set -eu
  cd /opt/kaktus
  exec 9>/tmp/kaktus-update.lock
  flock -n 9 || exit 0

  git fetch -q origin production
  NEW=$(git rev-parse origin/production)
  CUR=$(cat deploy/.deployed 2>/dev/null || echo нет)
  if [ "${FORCE:-}" != 1 ]; then
    [ "$NEW" = "$CUR" ] && exit 0
    [ "$NEW" = "$(cat deploy/.failed 2>/dev/null || true)" ] && exit 0
  fi

  echo "$(date '+%F %T') обновление $CUR -> $NEW"
  git reset -q --hard "$NEW"
  cd deploy
  if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
    ./backup.sh || echo "$(date '+%F %T') резервная копия не удалась"
  fi
  GIT_SHA=$NEW docker compose up -d --build --remove-orphans

  for i in $(seq 1 45); do
    if docker compose exec -T api wget -qO- http://127.0.0.1:3000/health 2>/dev/null | grep -q "$NEW"; then
      echo "$NEW" > .deployed
      rm -f .failed
      echo "$(date '+%F %T') готово"
      docker image prune -f > /dev/null 2>&1 || true
      return 0
    fi
    sleep 2
  done
  echo "$NEW" > .failed
  echo "$(date '+%F %T') ОШИБКА: новая версия не отвечает. Журнал сервера: cd /opt/kaktus/deploy && docker compose logs --tail 100 api"
  return 1
}
main "$@"
exit $?
