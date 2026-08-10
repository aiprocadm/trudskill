#!/usr/bin/env bash
set -uo pipefail

# Замер §12.4: пакет документов на группу из 25 слушателей ≤ 2 минут.
#
# ЗАЧЕМ. Это единственное число ТЗ, которое ни разу не измеряли — в отличие от §12.1, где
# уже три захода оптимизации и живые прогоны. Причина простая: замер требует полностью
# настроенного курса, а не просто данных. Скрипт делает замер одной командой, как только
# такой курс есть.
#
# ЧТО МЕРЯЕМ. Время от запуска выпуска до момента, когда ВСЕ задачи документов группы
# перестали быть `queued`/`running`. Именно это чувствует человек: не «ручка ответила»,
# а «документы готовы».
#
# ЧТО НУЖНО ПОДГОТОВИТЬ ЗАРАНЕЕ (без этого выпуск не запустится — это требования продукта,
# а не скрипта):
#   1. Программа с опубликованной версией и паспортом.
#   2. Набор документов курса (`courseDocumentSets`) с шаблонами и правилами нумерации.
#   3. Комиссия и действующая лицензия центра.
#   4. Группа из 25 слушателей с завершёнными зачислениями.
#
# Запуск:
#   BASE_URL=http://127.0.0.1:3011/api/v1 TENANT_ID=tenant_demo GROUP_ID=group_x \
#   TOKEN=<jwt> infra/load/measure-document-package.sh

BASE_URL="${BASE_URL:-http://127.0.0.1:3011/api/v1}"
TENANT_ID="${TENANT_ID:-tenant_demo}"
GROUP_ID="${GROUP_ID:-}"
TOKEN="${TOKEN:-}"
BUDGET_SECONDS="${BUDGET_SECONDS:-120}"
POLL_SECONDS="${POLL_SECONDS:-2}"

if [ -z "$GROUP_ID" ] || [ -z "$TOKEN" ]; then
  echo "Нужны GROUP_ID и TOKEN" >&2
  exit 1
fi

auth=(-H "x-tenant-id: $TENANT_ID" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json')

pending_count() {
  curl -sS --max-time 15 "${auth[@]}" "$BASE_URL/document-tasks" |
    python3 -c 'import json,sys
try:
    items = json.load(sys.stdin)["data"]["items"]
except Exception:
    print(-1); raise SystemExit
print(sum(1 for t in items if t.get("status") in ("queued", "running")))'
}

echo "[замер] запускаем выпуск пакета документов для группы $GROUP_ID"
started="$(date +%s)"

response="$(curl -sS --max-time 60 -X POST "${auth[@]}" \
  "$BASE_URL/groups/$GROUP_ID/close-chain" -d '{}' -w '\n%{http_code}')"
code="$(printf '%s' "$response" | tail -1)"

if [ "$code" != "200" ] && [ "$code" != "201" ]; then
  echo "[замер] выпуск не запустился (код $code). Скорее всего, не хватает подготовки:" >&2
  printf '%s\n' "$response" | head -3 >&2
  echo "См. перечень в шапке этого файла — программа, набор документов, комиссия, лицензия." >&2
  exit 1
fi

echo "[замер] ждём, пока все задачи документов завершатся (предел ${BUDGET_SECONDS} с)"
while :; do
  now="$(date +%s)"
  elapsed=$((now - started))
  pending="$(pending_count)"

  if [ "$pending" = "-1" ]; then
    echo "[замер] не удалось прочитать список задач — прерываю" >&2
    exit 1
  fi
  if [ "$pending" -eq 0 ]; then
    echo "[замер] ГОТОВО за ${elapsed} с (предел §12.4 — ${BUDGET_SECONDS} с)"
    # Ненулевой код при перелёте: замер должен краснеть, а не сообщать «ну почти».
    [ "$elapsed" -le "$BUDGET_SECONDS" ] && exit 0 || exit 1
  fi
  if [ "$elapsed" -ge "$BUDGET_SECONDS" ]; then
    echo "[замер] НЕ УЛОЖИЛИСЬ: спустя ${elapsed} с в работе ещё $pending задач(и)"
    exit 1
  fi

  sleep "$POLL_SECONDS"
done
