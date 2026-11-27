#!/bin/sh
# Автообновление сервера «Кактуса». Запускается cron раз в 2 минуты (ставит install-auto-update.sh).
# Следит за ветками на GitHub, куда попадает только код, прошедший автотесты:
#   production     — сервер (API); перед обновлением — резервная копия базы;
#   production-web — веб-версия приложения (готовые файлы для app.vectorfamily.kz).
# Журнал: /var/log/kaktus-update.log
# Вся логика — в функциях: git может заменить этот файл прямо во время работы.

update_api() {
  git fetch -q origin production
  NEW=$(git rev-parse origin/production)
  CUR=$(cat deploy/.deployed 2>/dev/null || echo нет)
  if [ "${FORCE:-}" != 1 ]; then
    [ "$NEW" = "$CUR" ] && return 0
    [ "$NEW" = "$(cat deploy/.failed 2>/dev/null || true)" ] && return 0
  fi

  echo "$(date '+%F %T') обновление $CUR -> $NEW"
  git reset -q --hard "$NEW"
  cd deploy
  mkdir -p web
  if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
    ./backup.sh || echo "$(date '+%F %T') резервная копия не удалась"
  fi
  GIT_SHA=$NEW docker compose up -d --build --remove-orphans
  # Caddyfile подключён файлом: изменения в нём применяем без перезапуска
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile > /dev/null 2>&1 || true

  for i in $(seq 1 45); do
    if docker compose exec -T api wget -qO- http://127.0.0.1:3000/health 2>/dev/null | grep -q "$NEW"; then
      echo "$NEW" > .deployed
      rm -f .failed
      echo "$(date '+%F %T') готово"
      docker image prune -f > /dev/null 2>&1 || true
      cd ..
      return 0
    fi
    sleep 2
  done
  echo "$NEW" > .failed
  echo "$(date '+%F %T') ОШИБКА: новая версия не отвечает. Журнал сервера: cd /opt/kaktus/deploy && docker compose logs --tail 100 api"
  cd ..
  return 1
}

update_web() {
  git fetch -q origin production-web 2>/dev/null || return 0
  W=$(git rev-parse origin/production-web)
  [ "$W" = "$(cat deploy/.web-deployed 2>/dev/null || true)" ] && [ "${FORCE:-}" != 1 ] && return 0
  mkdir -p deploy/web/releases
  D="deploy/web/releases/$W"
  rm -rf "$D" && mkdir -p "$D"
  git archive "$W" | tar -x -C "$D"
  # переключаем ссылку атомарно: открытые страницы не ломаются
  ln -sfn "releases/$W" deploy/web/current.tmp && mv -T deploy/web/current.tmp deploy/web/current
  echo "$W" > deploy/.web-deployed
  echo "$(date '+%F %T') веб-версия обновлена: $W"
  # храним три последние версии
  ls -1t deploy/web/releases | tail -n +4 | while read -r old; do rm -rf "deploy/web/releases/$old"; done
}

main() {
  set -eu
  cd /opt/kaktus
  exec 9>/tmp/kaktus-update.lock
  flock -n 9 || exit 0
  rc=0
  update_api || rc=1
  update_web || echo "$(date '+%F %T') веб-версию обновить не удалось"
  return $rc
}
main "$@"
exit $?
