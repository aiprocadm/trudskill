#!/usr/bin/env bash
set -uo pipefail

# Присмотр за воркером стенда (2026-08-10).
#
# ЗАЧЕМ. Воркер выпускает документы, но на стенде он не был запущен ВООБЩЕ: службы там
# только для бэкенда, витрины и realtime. Тревоги честно кричали «воркер не отвечает» —
# и были правы: документы выпускаться не могли в принципе.
#
# ПОЧЕМУ CRON, А НЕ СЛУЖБА. Системные службы требуют root, которого здесь нет, а
# пользовательские не переживают выход из системы (`Linger=no`). Присмотр через cron —
# тот же способ, которым здесь уже работают копии и тревоги.
#
# КАК ИЩЕТСЯ ЗАПУЩЕННЫЙ ВОРКЕР. По файлу с номером процесса, а НЕ по строке запуска.
# Первая версия искала процесс по пути `apps/worker` — а в командной строке его нет
# (запуск идёт как `node_modules/.bin/tsx src/main.ts`, каталог задаётся отдельно).
# Проверка «не запущен» срабатывала всегда, и сторож плодил бы новую копию каждые три
# минуты: несколько воркеров разобрали бы одну очередь наперегонки.

STAND=/home/aiproc/stands/trudskill
LOG=/home/aiproc/stands/logs/cdoprof-worker.log
PIDFILE=/home/aiproc/stands/logs/.worker.pid
STAMP=/home/aiproc/stands/logs/.worker-commit
HEALTH=http://127.0.0.1:3030/healthz

mkdir -p "$(dirname "$LOG")"

# Номер живого воркера или пусто. Сверяем не только «процесс существует», но и что это
# ИМЕННО наш воркер: номера переиспользуются, и попасть в чужой процесс легко.
running_pid() {
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [ -n "$pid" ] || return 0
  [ -d "/proc/$pid" ] || return 0
  [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$STAND/apps/worker" ] || return 0
  echo "$pid"
}

start_worker() {
  cd "$STAND/apps/worker" || exit 1
  nohup "$STAND/node_modules/.bin/tsx" src/main.ts >>"$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  git -C "$STAND" rev-parse HEAD > "$STAMP"
  echo "[$(date '+%F %T')] воркер запущен, pid $(cat "$PIDFILE") (код $(cut -c1-8 <"$STAMP"))" >>"$LOG"
}

stop_worker() {
  local pid="$1"
  kill "$pid" 2>/dev/null
  sleep 3
  [ -d "/proc/$pid" ] && kill -9 "$pid" 2>/dev/null
  return 0
}

pid="$(running_pid)"

# 1. Не запущен — поднять.
if [ -z "$pid" ]; then
  start_worker
  exit 0
fi

# 2. Запущен, но код стенда с тех пор обновился — перезапустить на свежем. Иначе воркер
#    месяцами крутил бы старую версию, пока остальные службы обновляются.
current="$(git -C "$STAND" rev-parse HEAD)"
started="$(cat "$STAMP" 2>/dev/null || true)"
if [ -n "$started" ] && [ "$current" != "$started" ]; then
  echo "[$(date '+%F %T')] код обновился, перезапускаю воркер" >>"$LOG"
  stop_worker "$pid"
  start_worker
  exit 0
fi

# 3. Процесс есть, но ручка живости молчит — значит завис; поднять заново.
code="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$HEALTH" 2>/dev/null || true)"
if [ "$code" != "200" ]; then
  echo "[$(date '+%F %T')] воркер не отвечает (код ${code:-нет}), перезапускаю" >>"$LOG"
  stop_worker "$pid"
  start_worker
fi
