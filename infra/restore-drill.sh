#!/usr/bin/env bash
set -euo pipefail

# УЧЕНИЯ ПО ВОССТАНОВЛЕНИЮ (ФТ-I4 / ФТ-G6, Фаза 6 Task 4).
#
# ЗАЧЕМ. «Бэкап есть» и «из бэкапа можно восстановиться» — разные утверждения, и второе
# без проверки не выполняется примерно никогда: то дамп обрезан, то в нём нет схемы, то
# восстановление падает на первой же ошибке, а её никто не видит, потому что psql по
# умолчанию продолжает работу. Узнавать об этом в день аварии поздно.
#
# ПОЧЕМУ ЭТО МОЖНО ДЕЛАТЬ БЕЗ СОГЛАСОВАНИЙ. Учения идут в ОДНОРАЗОВОМ контейнере Postgres
# на случайном порту: боевая база не открывается даже на чтение (читается только файл
# дампа), после проверки контейнер сносится. Именно поэтому пункт «restore-drill проведён»
# из дорожной карты закрывается кодом, а не отдельным мероприятием на боевом сервере.
#
# ЗАПУСК:
#   infra/restore-drill.sh                 # взять самый свежий дамп из каталога копий
#   infra/restore-drill.sh /путь/db.sql.gz # проверить конкретный файл
#
# Код возврата: 0 — учения прошли, ненулевой — восстановиться НЕ удалось.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/ops-lib.sh
. "$SCRIPT_DIR/ops-lib.sh"

BACKUP_DIR="$(ops_env BACKUP_DIR "/var/backups/cdoprof")"
PG_IMAGE="$(ops_env DRILL_PG_IMAGE "postgres:18")"
DRILL_DB="$(ops_env DRILL_DB "cdoprof_drill")"
DRILL_USER="$(ops_env DRILL_USER "drill")"
DRILL_PASSWORD="$(ops_env DRILL_PASSWORD "drill")"
# Порог RTO из ТЗ §12.3 — 4 часа на всё восстановление; здесь проверяется только часть
# «поднять базу из дампа», поэтому предел куда жёстче и настраивается.
RTO_BUDGET_SECONDS="$(ops_env DRILL_RTO_BUDGET_SECONDS "1800")"

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | head -1 || true)"
fi
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  ops_alert "Учения невозможны: в $BACKUP_DIR нет ни одного дампа базы"
  exit 1
fi

CONTAINER="cdoprof-restore-drill-$$"
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "=== Учения по восстановлению ==="
echo "Дамп:  $DUMP"
echo "Снят:  $(date -r "$DUMP" -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Размер: $(du -h "$DUMP" | awk '{print $1}')"

# --- 0. Проверки самого файла (до того, как поднимать базу) ------------------------
if [ -f "$DUMP.sha256" ]; then
  expected="$(cat "$DUMP.sha256")"
  actual="$(sha256sum "$DUMP" | awk '{print $1}')"
  if [ "$expected" != "$actual" ]; then
    ops_alert "Контрольная сумма дампа не совпала — файл испорчен: $DUMP"
    exit 1
  fi
  echo "Контрольная сумма: совпала"
else
  echo "Контрольная сумма: файла .sha256 нет (дамп снят старой версией скрипта)"
fi

if ! gzip -t "$DUMP" 2>/dev/null; then
  ops_alert "Дамп не читается как gzip — восстановиться из него нельзя: $DUMP"
  exit 1
fi

started_at="$(date +%s)"

# --- 1. Одноразовая база ----------------------------------------------------------
echo "--- Поднимаем одноразовый Postgres ($PG_IMAGE)…"
docker run -d --rm --name "$CONTAINER" \
  -e POSTGRES_DB="$DRILL_DB" \
  -e POSTGRES_USER="$DRILL_USER" \
  -e POSTGRES_PASSWORD="$DRILL_PASSWORD" \
  "$PG_IMAGE" >/dev/null

# Ждём готовности: без этого psql упрётся в «база ещё стартует» и учения покажут
# ложный отказ.
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U "$DRILL_USER" -d "$DRILL_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$CONTAINER" pg_isready -U "$DRILL_USER" -d "$DRILL_DB" >/dev/null 2>&1; then
  ops_alert "Одноразовая база так и не поднялась — учения не состоялись"
  exit 1
fi

# --- 2. Восстановление ------------------------------------------------------------
# ON_ERROR_STOP=1 обязателен: без него psql проглатывает ошибки и выходит с кодом 0,
# то есть «успешное» восстановление может оставить половину таблиц.
echo "--- Восстанавливаем…"
restore_log="$(mktemp)"
if ! gunzip -c "$DUMP" | docker exec -i "$CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$DRILL_USER" -d "$DRILL_DB" >"$restore_log" 2>&1; then
  ops_alert "Восстановление из дампа НЕ УДАЛОСЬ: $DUMP"
  echo "--- последние строки журнала восстановления:"
  tail -20 "$restore_log"
  rm -f "$restore_log"
  exit 1
fi
rm -f "$restore_log"

# --- 3. Проверки «живости» --------------------------------------------------------
# Восстановилось без ошибок — ещё не значит «восстановились данные». Смотрим на то,
# без чего центр не работает: схемы, применённые миграции и ключевые таблицы.
query() { docker exec -i "$CONTAINER" psql -tAq -U "$DRILL_USER" -d "$DRILL_DB" -c "$1"; }

schemas="$(query "select count(*) from information_schema.schemata where schema_name in ('core','iam','learning','assessment','documents','audit')")"
tables="$(query "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")"
migrations="$(query "select count(*) from core.schema_migrations" 2>/dev/null || echo 0)"
tenants="$(query "select count(*) from core.tenants" 2>/dev/null || echo 0)"
users="$(query "select count(*) from iam.users" 2>/dev/null || echo 0)"

echo "--- Что восстановилось:"
echo "    схем из ожидаемых шести: $schemas"
echo "    таблиц всего:            $tables"
echo "    записей о миграциях:     $migrations"
echo "    центров (тенантов):      $tenants"
echo "    пользователей:           $users"

failures=0
if [ "$schemas" -lt 6 ]; then
  echo "    ОШИБКА: восстановились не все схемы"
  failures=$((failures + 1))
fi
if [ "$tables" -lt 50 ]; then
  echo "    ОШИБКА: подозрительно мало таблиц ($tables)"
  failures=$((failures + 1))
fi
if [ "$migrations" -lt 1 ]; then
  echo "    ОШИБКА: журнал миграций пуст — дамп снят до применения миграций?"
  failures=$((failures + 1))
fi
if [ "$tenants" -lt 1 ]; then
  echo "    ОШИБКА: ни одного центра — восстановились структуры без данных"
  failures=$((failures + 1))
fi

elapsed=$(( $(date +%s) - started_at ))
echo "--- Фактическое время восстановления (RTO): ${elapsed} с"

if [ "$failures" -gt 0 ]; then
  ops_alert "Учения провалены: $failures проверок не прошло (дамп $DUMP)"
  exit 1
fi
if [ "$elapsed" -gt "$RTO_BUDGET_SECONDS" ]; then
  ops_alert "Восстановление уложилось, но заняло ${elapsed} с при пределе ${RTO_BUDGET_SECONDS} с"
  exit 1
fi

echo "=== Учения пройдены: из копии поднимается работоспособная база за ${elapsed} с ==="
