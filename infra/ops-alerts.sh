#!/usr/bin/env bash
set -uo pipefail

# ПЯТЬ СИГНАЛОВ ТРЕВОГИ (ФТ-I1/I2, Фаза 6 Task 6).
#
# ЗАЧЕМ. Метрики и проверки живости уже есть, но смотреть в них некому: сборщика на
# сервере нет, а сами по себе они никого не будят. Этот скрипт — самое дешёвое, что
# закрывает «дашборды и алерты» из цели фазы: раз в несколько минут проверяет пять
# вещей, из-за которых центр встаёт, и молчит, пока всё в порядке.
#
# Проверяем ровно то, что ломается на практике:
#   1. Бэкенд не отвечает            — учиться нельзя вообще.
#   2. Воркер молчит или завис       — документы не выпускаются, очередь копится.
#   3. Очередь задач растёт          — то же самое, но видно раньше.
#   4. Копия базы протухла           — авария станет безвозвратной.
#   5. Диск заканчивается            — база встанет в read-only, копия не снимется.
#   6. Планировщик замолчал           — напоминания/чистка ПДн/счета тихо не работают.
#   7. Всплеск ошибок 5xx             — что-то сломалось на релизе, а страницы «почти» живые.
#
# Запуск (каждые 5 минут):
#   */5 * * * * cd /path/to/repo && infra/ops-alerts.sh >> /var/log/cdoprof-alerts.log 2>&1
#
# `set -e` здесь намеренно НЕ включён: одна недоступная проверка не должна отменять
# остальные — иначе упавший бэкенд «спрячет» кончающийся диск.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/ops-lib.sh
. "$SCRIPT_DIR/ops-lib.sh"

BACKEND_URL="${CDOPROF_BACKEND_URL:-http://127.0.0.1:3001/api/v1}"
WORKER_HEALTH_URL="${CDOPROF_WORKER_HEALTH_URL:-http://127.0.0.1:3030/healthz}"
METRICS_TOKEN="${METRICS_TOKEN:-}"
BACKUP_DIR="${CDOPROF_BACKUP_DIR:-/var/backups/cdoprof}"
BACKUP_MAX_AGE_HOURS="${CDOPROF_BACKUP_MAX_AGE_HOURS:-26}"
QUEUE_BACKLOG_LIMIT="${CDOPROF_QUEUE_BACKLOG_LIMIT:-50}"
DISK_USED_LIMIT_PERCENT="${CDOPROF_DISK_USED_LIMIT_PERCENT:-85}"
# Всплеск 5xx считается по приросту между запусками, поэтому нужен файл с прошлым значением.
STATE_FILE="${CDOPROF_ALERTS_STATE_FILE:-${TMPDIR:-/tmp}/cdoprof-alerts-state}"
ERRORS_5XX_LIMIT="${CDOPROF_ERRORS_5XX_LIMIT:-20}"

problems=0
note() { echo "[тревоги] $1"; }

curl_get() {
  # --max-time: подвисшая проверка не должна занимать место следующего запуска.
  curl -sS --max-time 10 "$@" 2>/dev/null
}

# --- 1. Бэкенд жив ----------------------------------------------------------------
# `|| true` вместо `|| echo 000`: curl при неудаче печатает свой «000» сам, и вторая
# подстановка склеивалась с первой — оператор видел бессмысленный код «000000».
ready_code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "$BACKEND_URL/health/ready" 2>/dev/null || true)"
ready_code="${ready_code:-000}"
if [ "$ready_code" != "200" ]; then
  ops_alert "Бэкенд не готов принимать запросы: /health/ready ответил $ready_code"
  problems=$((problems + 1))
else
  note "бэкенд отвечает"
fi

# --- 2. Воркер жив ----------------------------------------------------------------
worker_code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "$WORKER_HEALTH_URL" 2>/dev/null || true)"
worker_code="${worker_code:-000}"
case "$worker_code" in
  200) note "воркер жив" ;;
  503) ops_alert "Воркер завис: не обрабатывал сообщения дольше порога. Документы не выпускаются."; problems=$((problems + 1)) ;;
  *)   ops_alert "Воркер не отвечает (код $worker_code) — вероятно, процесс умер. Документы не выпускаются."; problems=$((problems + 1)) ;;
esac

# --- 3. Очередь задач не растёт ---------------------------------------------------
# Берём из метрик бэкенда: они уже считают задачи документов в работе.
metrics_args=(-H 'accept: text/plain')
[ -n "$METRICS_TOKEN" ] && metrics_args+=(-H "authorization: Bearer $METRICS_TOKEN")
metrics="$(curl_get "${metrics_args[@]}" "$BACKEND_URL/metrics" || true)"
if [ -z "$metrics" ]; then
  note "метрики недоступны — проверка очереди пропущена (см. сигнал 1)"
else
  backlog="$(printf '%s\n' "$metrics" | awk '/^document_tasks_backlog /{print int($2)}' | tail -1)"
  if [ -z "${backlog:-}" ]; then
    # Молчать здесь нельзя: «нет метрики» и «очередь пуста» — разные вещи, а раньше
    # оба показывались как «в норме (0)». Так выглядит бэкенд старой версии.
    note "метрика очереди не найдена — бэкенд ещё не обновлён, проверка пропущена"
  elif [ "$backlog" -gt "$QUEUE_BACKLOG_LIMIT" ]; then
    ops_alert "Очередь задач документов растёт: $backlog в работе (порог $QUEUE_BACKLOG_LIMIT)"
    problems=$((problems + 1))
  else
    note "очередь задач в норме ($backlog)"
  fi

  # --- 7. Всплеск ошибок 5xx ----------------------------------------------------
  # Считаем ПРИРОСТ с прошлого запуска, а не общее число: счётчик с момента старта
  # растёт вечно, и по нему нельзя отличить «сломалось сейчас» от «сломалось месяц назад».
  errors_now="$(printf '%s\n' "$metrics" | awk -F' ' '/^http_requests_total\{.*status="5/ {sum += $NF} END {print sum + 0}')"
  errors_prev=""
  [ -f "$STATE_FILE" ] && errors_prev="$(cat "$STATE_FILE" 2>/dev/null || true)"
  printf '%s\n' "$errors_now" >"$STATE_FILE" 2>/dev/null || true
  if [ -z "$errors_prev" ]; then
    note "ошибки 5xx: первый запуск, сравнивать не с чем"
  else
    # Отрицательный прирост = бэкенд перезапустили, счётчик обнулился. Это не всплеск.
    delta=$((errors_now - errors_prev))
    if [ "$delta" -gt "$ERRORS_5XX_LIMIT" ]; then
      ops_alert "Всплеск ошибок сервера: +$delta ответов 5xx с прошлой проверки (порог $ERRORS_5XX_LIMIT)"
      problems=$((problems + 1))
    else
      note "ошибки 5xx в норме (прирост $((delta > 0 ? delta : 0)))"
    fi
  fi

  # --- 6. Планировщики отрабатывают ---------------------------------------------
  # Бэкенд помечает каждый ночной прогон; `scheduler_overdue 1` означает, что
  # планировщик не отработал за два своих интервала — то есть не запускается вообще.
  overdue="$(printf '%s\n' "$metrics" | awk '/^scheduler_overdue\{/ && $2 == 1 {match($0, /job="[^"]+"/); print substr($0, RSTART+5, RLENGTH-6)}')"
  if [ -n "$overdue" ]; then
    ops_alert "Планировщики молчат дольше своего интервала: $(printf '%s' "$overdue" | tr '\n' ' ')"
    problems=$((problems + 1))
  else
    note "планировщики отрабатывают"
  fi
fi

# --- 4. Копия базы свежая ---------------------------------------------------------
newest="$(ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | head -1 || true)"
if [ -z "$newest" ]; then
  ops_alert "Резервных копий базы нет ни одной ($BACKUP_DIR) — авария станет безвозвратной"
  problems=$((problems + 1))
else
  age_hours=$(( ( $(date +%s) - $(date -r "$newest" +%s) ) / 3600 ))
  if [ "$age_hours" -gt "$BACKUP_MAX_AGE_HOURS" ]; then
    ops_alert "Копия базы протухла: последняя снята ${age_hours} ч назад (предел ${BACKUP_MAX_AGE_HOURS} ч)"
    problems=$((problems + 1))
  else
    note "копия базы свежая (${age_hours} ч)"
  fi
fi

# --- 5. Место на диске ------------------------------------------------------------
used_percent="$(df -P "$BACKUP_DIR" 2>/dev/null || df -P /)"
used_percent="$(printf '%s\n' "$used_percent" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [ -n "$used_percent" ] && [ "$used_percent" -gt "$DISK_USED_LIMIT_PERCENT" ]; then
  ops_alert "Диск заполнен на ${used_percent}% (порог ${DISK_USED_LIMIT_PERCENT}%): база встанет в read-only, копия не снимется"
  problems=$((problems + 1))
else
  note "диск занят на ${used_percent:-?}%"
fi

if [ "$problems" -gt 0 ]; then
  echo "[тревоги] проблем: $problems"
  exit 1
fi
echo "[тревоги] всё в порядке"
