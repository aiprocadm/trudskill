#!/usr/bin/env bash
set -euo pipefail

# СТОРОЖ СВЕЖЕСТИ КОПИЙ (Фаза 6 Task 4).
#
# ЗАЧЕМ. Самый частый способ остаться без резервной копии — не «диск сгорел», а
# «скрипт тихо перестал запускаться, и никто не заметил». Каталог с копиями при этом
# выглядит обжитым: файлы лежат, просто самый свежий — трёхнедельной давности.
# Сторож отвечает на один вопрос: если авария случится СЕЙЧАС, сколько данных мы потеряем.
#
# Запускать по расписанию, через час-другой после самого бэкапа:
#   30 4 * * * cd /path/to/repo && infra/backup-watchdog.sh >> /var/log/cdoprof-backup.log 2>&1
#
# Код возврата: 0 — копия свежая и целая; ненулевой — беда (cron пришлёт письмо,
# а при заданном CDOPROF_ALERT_CMD уйдёт сообщение в канал).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/ops-lib.sh
. "$SCRIPT_DIR/ops-lib.sh"

BACKUP_DIR="${CDOPROF_BACKUP_DIR:-/var/backups/cdoprof}"
# 26 часов, а не 24: суточная копия плюс запас на длинный дамп и перевод часов.
MAX_AGE_HOURS="${CDOPROF_BACKUP_MAX_AGE_HOURS:-26}"
MIN_FREE_GB="${CDOPROF_MIN_FREE_GB:-5}"

problems=0

# --- 1. Копия вообще есть? --------------------------------------------------------
newest="$(ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | head -1 || true)"
if [ -z "$newest" ]; then
  ops_alert "Резервных копий базы НЕТ ни одной (каталог $BACKUP_DIR). Потеря данных при аварии — полная."
  exit 1
fi

# --- 2. Копия свежая? -------------------------------------------------------------
age_seconds=$(( $(date +%s) - $(date -r "$newest" +%s) ))
age_hours=$(( age_seconds / 3600 ))
if [ "$age_hours" -gt "$MAX_AGE_HOURS" ]; then
  ops_alert "Свежей копии нет: последняя снята ${age_hours} ч назад (предел ${MAX_AGE_HOURS} ч). Файл: $(basename "$newest")"
  problems=$((problems + 1))
else
  echo "[сторож] последняя копия: $(basename "$newest"), возраст ${age_hours} ч"
fi

# --- 3. Копия целая? --------------------------------------------------------------
if [ -f "$newest.sha256" ]; then
  if [ "$(cat "$newest.sha256")" != "$(sha256sum "$newest" | awk '{print $1}')" ]; then
    ops_alert "Контрольная сумма последней копии НЕ совпала — файл испорчен: $(basename "$newest")"
    problems=$((problems + 1))
  fi
else
  echo "[сторож] у копии нет файла контрольной суммы — снята старой версией скрипта"
fi
if ! gzip -t "$newest" 2>/dev/null; then
  ops_alert "Последняя копия не читается как gzip: $(basename "$newest")"
  problems=$((problems + 1))
fi

# --- 4. Отметка об успехе бэкапа --------------------------------------------------
# Файл копии может лежать с прошлого раза, а сам скрипт — падать на MinIO или отправке
# вне сервера. Отметка отвечает на вопрос «прошёл ли бэкап ЦЕЛИКОМ».
if [ -f "$BACKUP_DIR/last-success" ]; then
  marker_age_hours=$(( ( $(date +%s) - $(date -r "$BACKUP_DIR/last-success" +%s) ) / 3600 ))
  if [ "$marker_age_hours" -gt "$MAX_AGE_HOURS" ]; then
    ops_alert "Бэкап не завершался успешно ${marker_age_hours} ч (отметка last-success устарела)"
    problems=$((problems + 1))
  fi
else
  ops_alert "Нет отметки об успешном бэкапе (файл last-success) — скрипт ни разу не доходил до конца"
  problems=$((problems + 1))
fi

# --- 5. Есть ли куда писать следующую копию ---------------------------------------
ops_require_space "$BACKUP_DIR" "$MIN_FREE_GB" || problems=$((problems + 1))

if [ "$problems" -gt 0 ]; then
  echo "[сторож] проблем: $problems"
  exit 1
fi
echo "[сторож] копии в порядке"
