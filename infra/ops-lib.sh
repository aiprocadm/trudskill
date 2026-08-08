#!/usr/bin/env bash
# Общие функции эксплуатационных скриптов (Фаза 6, ЭПИК I).
#
# Файл подключается через `source`, сам ничего не делает и не выходит.
# Держим его отдельно, чтобы три скрипта (бэкап, сторож свежести, учения) не разъехались
# в том, КАК они сообщают о беде: канал тревоги настраивается в одном месте.

# Канал тревоги. Пусто — сообщение просто идёт в stderr и в код возврата, и этого уже
# достаточно для cron (он шлёт письмо владельцу при ненулевом коде). Если задать
# CDOPROF_ALERT_CMD, текст уйдёт туда: команда получает сообщение на stdin.
#   пример: CDOPROF_ALERT_CMD='curl -sS -X POST -d @- https://api.telegram.org/bot<токен>/sendMessage?chat_id=<чат>&text'
ops_alert() {
  local message="$1"
  echo "[ТРЕВОГА] $message" >&2
  if [ -n "${CDOPROF_ALERT_CMD:-}" ]; then
    # Канал не должен ронять сам скрипт: не смогли доставить — пишем и живём дальше,
    # иначе недоступный телеграм «съел» бы и сам бэкап.
    printf '%s\n' "$message" | eval "${CDOPROF_ALERT_CMD}" >/dev/null 2>&1 \
      || echo "[ТРЕВОГА] канал недоступен, сообщение осталось только в журнале" >&2
  fi
}

# Свободное место в гигабайтах на файловой системе, где лежит переданный каталог.
# Каталог может ещё не существовать — тогда смотрим на ближайшего существующего предка.
ops_free_gb() {
  local path="$1"
  while [ ! -d "$path" ] && [ "$path" != '/' ]; do
    path="$(dirname "$path")"
  done
  df -Pk "$path" | awk 'NR==2 {printf "%d", $4/1024/1024}'
}

# Проверка порога свободного места. Дешевле не начать бэкап, чем оборвать его на середине
# и получить обрезанный дамп, который выглядит как настоящий.
ops_require_space() {
  local path="$1" min_gb="$2" free_gb
  free_gb="$(ops_free_gb "$path")"
  if [ "$free_gb" -lt "$min_gb" ]; then
    ops_alert "Мало места на диске: свободно ${free_gb} ГБ, требуется не меньше ${min_gb} ГБ (${path})"
    return 1
  fi
  echo "[ops] свободно ${free_gb} ГБ (порог ${min_gb} ГБ)"
}

# Команда-приставка для запуска psql/pg_dump «внутри» Postgres.
#
# ЗАЧЕМ это переменной, а не жёстко в коде: топология развёртывания у прод-стека и у
# стенда РАЗНАЯ. Прежний скрипт звал `docker compose -f infra/docker-compose.prod.yml
# exec -T postgres`, а на стенде такого стека нет вовсе — там systemd-сервисы и общий
# контейнер `test-postgres`. Скрипт молча не работал бы именно там, где нужен.
#   прод:  docker compose -f infra/docker-compose.prod.yml exec -T postgres
#   стенд: docker exec -i test-postgres
ops_pg_exec() {
  echo "${CDOPROF_PG_EXEC:-docker compose -f infra/docker-compose.prod.yml exec -T postgres}"
}
