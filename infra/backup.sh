#!/usr/bin/env bash
set -euo pipefail

# Резервная копия CDOProf: дамп PostgreSQL (главное) + снимок тома MinIO.
#
# Запускать из корня репозитория. Расписание — в crontab (ежедневно в 03:00):
#   0 3 * * * cd /path/to/repo && infra/backup.sh >> /var/log/cdoprof-backup.log 2>&1
#
# ЧТО ИЗМЕНИЛОСЬ В ФАЗЕ 6 (Task 4) и почему:
#  1. Топология больше не зашита. Прежний скрипт звал прод-compose, которого на стенде
#     нет, — то есть на стенде он бы не отработал. Теперь способ достучаться до базы
#     задаётся переменной TRUDSKILL_PG_EXEC (см. infra/ops-lib.sh).
#  2. Дамп пишется во временный файл и переименовывается только ПОСЛЕ проверки.
#     Раньше перенаправление создавало файл ДО запуска pg_dump: сбой на середине
#     оставлял обрезанный .gz, который по имени и размеру выглядел как настоящая копия.
#     Такую «копию» замечают в момент восстановления — то есть в худший момент.
#  3. Появились проверки: свободное место ДО начала, `gzip -t` и контрольная сумма ПОСЛЕ.
#  4. Пишется отметка об успехе — по ней сторож (infra/backup-watchdog.sh) понимает,
#     что копия свежая, а не протухла три недели назад.
#
# ВОССТАНОВЛЕНИЕ проверяется автоматически: infra/restore-drill.sh (учения на одноразовой
# базе, боевую не трогает).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/ops-lib.sh
. "$SCRIPT_DIR/ops-lib.sh"

BACKUP_DIR="$(ops_env BACKUP_DIR "/var/backups/cdoprof")"
RETENTION_DAYS="$(ops_env BACKUP_RETENTION_DAYS "14")"
MIN_FREE_GB="$(ops_env MIN_FREE_GB "5")"
MINIO_VOLUME="$(ops_env MINIO_VOLUME "cdoprof_minio-data")"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Учётные данные прод-стека; на стенде их подставляет окружение сервиса.
if [ -f infra/.env.production ]; then
  set -a
  # shellcheck disable=SC1091
  . infra/.env.production
  set +a
fi

PG_USER="${POSTGRES_USER:-cdoprof}"
PG_DB="${POSTGRES_DB:-cdoprof}"
PG_EXEC="$(ops_pg_exec)"

mkdir -p "$BACKUP_DIR"
ops_require_space "$BACKUP_DIR" "$MIN_FREE_GB"

# Незавершённые куски не должны оставаться в каталоге копий: их легко принять за копию.
cleanup_partials() {
  rm -f "$BACKUP_DIR"/*.part 2>/dev/null || true
}
trap cleanup_partials EXIT

# --- 1. Дамп базы -----------------------------------------------------------------
db_part="$BACKUP_DIR/db-$STAMP.sql.gz.part"
db_file="$BACKUP_DIR/db-$STAMP.sql.gz"

echo "[backup] дамп базы $PG_DB…"
# --no-owner --no-privileges — не украшательство, а условие восстановимости.
#
# Первые же учения (infra/restore-drill.sh) показали: обычный дамп на ЧИСТОМ сервере не
# восстанавливается вовсе. pg_dump записывает в него команды «сделать владельцем роль X»,
# а на новой машине такой роли нет — восстановление обрывается на первой же строке
# с «role does not exist». То есть копия была, а восстановиться из неё было нельзя —
# и узнали бы мы об этом в день аварии.
#
# Без владельцев и прав дамп переносим куда угодно: объекты достаются той роли, под
# которой идёт восстановление (в порядке восстановления это роль приложения — см.
# docs/backup-and-restore.md). Побочная польза: кластер Postgres на стенде общий с
# другими проектами, и выгружать глобальные роли целиком значило бы класть в наш бэкап
# чужие учётные записи вместе с хешами паролей.
# shellcheck disable=SC2086
$PG_EXEC pg_dump --no-owner --no-privileges -U "$PG_USER" "$PG_DB" | gzip >"$db_part"

# Проверяем ДО переименования: файл становится «копией», только пройдя проверку.
if ! gzip -t "$db_part" 2>/dev/null; then
  ops_alert "Дамп базы повреждён сразу после снятия (gzip -t не прошёл): $db_part"
  exit 1
fi
# Пустой дамп — тоже авария: pg_dump мог упасть, отдав пару строк заголовка.
db_bytes="$(wc -c <"$db_part")"
if [ "$db_bytes" -lt 10240 ]; then
  ops_alert "Дамп базы подозрительно мал (${db_bytes} байт) — считаем неудачей"
  exit 1
fi
mv "$db_part" "$db_file"
sha256sum "$db_file" | awk '{print $1}' >"$db_file.sha256"

# --- 2. Файлы MinIO ---------------------------------------------------------------
# Тома может не быть (например, на машине только база) — это не повод валить бэкап базы.
if docker volume inspect "$MINIO_VOLUME" >/dev/null 2>&1; then
  minio_part="$BACKUP_DIR/minio-$STAMP.tar.gz.part"
  minio_file="$BACKUP_DIR/minio-$STAMP.tar.gz"
  echo "[backup] снимок тома $MINIO_VOLUME…"
  docker run --rm \
    -v "$MINIO_VOLUME:/data:ro" \
    -v "$BACKUP_DIR:/backup" \
    alpine tar czf "/backup/$(basename "$minio_part")" -C /data .
  if ! gzip -t "$minio_part" 2>/dev/null; then
    ops_alert "Снимок MinIO повреждён сразу после снятия: $minio_part"
    exit 1
  fi
  mv "$minio_part" "$minio_file"
  sha256sum "$minio_file" | awk '{print $1}' >"$minio_file.sha256"
else
  echo "[backup] том $MINIO_VOLUME не найден — снимок файлов пропущен"
fi

# --- 3. Копия вне сервера ---------------------------------------------------------
# Назначение подключает владелец (вопрос №C плана Фазы 6): команда получает путь к файлу.
# Пока переменная пуста, копия остаётся только на этом сервере — и это надо помнить:
# пожар в машинном зале уносит и боевые данные, и «резерв».
if [ -n "$(ops_env OFFSITE_CMD "")" ]; then
  echo "[backup] отправка копии вне сервера…"
  for f in "$db_file" "${minio_file:-}"; do
    [ -n "$f" ] && [ -f "$f" ] || continue
    if ! eval "${offsite_cmd} \"$f\""; then
      ops_alert "Копию не удалось отправить вне сервера: $f"
      exit 1
    fi
  done
else
  echo "[backup] ВНИМАНИЕ: копия вне сервера не настроена (TRUDSKILL_OFFSITE_CMD пуст)"
fi

# --- 4. Чистка старого ------------------------------------------------------------
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'db-*.sql.gz.sha256' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'minio-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'minio-*.tar.gz.sha256' -mtime +"$RETENTION_DAYS" -delete

# --- 5. Отметка об успехе ---------------------------------------------------------
# По ней сторож отличает «копия свежая» от «скрипт молча не запускался три недели».
date -u +%Y-%m-%dT%H:%M:%SZ >"$BACKUP_DIR/last-success"

echo "[backup] готово -> $BACKUP_DIR ($(basename "$db_file"))"
