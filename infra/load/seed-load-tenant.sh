#!/usr/bin/env bash
set -euo pipefail

# Подготовка отдельного тенанта под нагрузку (Фаза 6 Task 10, §12.1).
#
# ЗАЧЕМ ОТДЕЛЬНЫЙ. Гонять нагрузку по рабочему центру нельзя: пятьсот выдуманных слушателей
# перемешаются с настоящими в списках и отчётах, а журнал аудита забьётся служебными
# записями. Поэтому — свой тенант, который не жалко.
#
# ЧТО ДЕЛАЕТ:
#   1. Заводит тенант (или использует существующий с тем же кодом).
#   2. Заливает в него N слушателей ОБЫЧНЫМ массовым импортом — тем самым кодом, что и в
#      бою, а не вставкой в базу мимо приложения. Иначе замер получился бы про данные,
#      которых приложение никогда не создаёт.
#
# Запуск:
#   BASE_URL=http://127.0.0.1:3011/api/v1 \
#   PLATFORM_LOGIN=platform_admin PLATFORM_PASSWORD='...' \
#   LEARNERS=500 infra/load/seed-load-tenant.sh

BASE_URL="${BASE_URL:-http://127.0.0.1:3011/api/v1}"
HOME_TENANT="${HOME_TENANT:-tenant_demo}"
LOAD_TENANT_CODE="${LOAD_TENANT_CODE:-load-pilot}"
PLATFORM_LOGIN="${PLATFORM_LOGIN:-platform_admin}"
PLATFORM_PASSWORD="${PLATFORM_PASSWORD:-}"
LEARNERS="${LEARNERS:-500}"

if [ -z "$PLATFORM_PASSWORD" ]; then
  echo "Нужен PLATFORM_PASSWORD (пароль платформенного администратора)" >&2
  exit 1
fi

login() {
  local login_name="$1" password="$2" tenant="$3"
  curl -sS -X POST "$BASE_URL/auth/login" \
    -H 'content-type: application/json' \
    -H "x-tenant-id: $tenant" \
    -d "{\"login\":\"$login_name\",\"password\":\"$password\"}" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])'
}

echo "[нагрузка] вход платформенным администратором"
PLATFORM_TOKEN="$(login "$PLATFORM_LOGIN" "$PLATFORM_PASSWORD" "$HOME_TENANT")"

echo "[нагрузка] создаём тенант $LOAD_TENANT_CODE (если его ещё нет)"
create_response="$(curl -sS -X POST "$BASE_URL/platform/tenants" \
  -H 'content-type: application/json' \
  -H "x-tenant-id: $HOME_TENANT" \
  -H "authorization: Bearer $PLATFORM_TOKEN" \
  -d "{\"code\":\"$LOAD_TENANT_CODE\",\"name\":\"Нагрузочный стенд\"}" || true)"

TENANT_ID="$(printf '%s' "$create_response" |
  python3 -c 'import json,sys
try:
    print(json.load(sys.stdin)["data"]["id"])
except Exception:
    print("")' 2>/dev/null || true)"

if [ -z "$TENANT_ID" ]; then
  # Уже существует — находим по коду. Повторный запуск не должен падать: сценарий гоняют
  # перед каждым замером.
  TENANT_ID="$(curl -sS "$BASE_URL/platform/tenants" \
    -H "x-tenant-id: $HOME_TENANT" -H "authorization: Bearer $PLATFORM_TOKEN" |
    python3 -c "import json,sys
items = json.load(sys.stdin)['data']
items = items['items'] if isinstance(items, dict) else items
print(next((t['id'] for t in items if t.get('code') == '$LOAD_TENANT_CODE'), ''))")"
fi

if [ -z "$TENANT_ID" ]; then
  echo "Не удалось ни создать, ни найти тенант $LOAD_TENANT_CODE" >&2
  echo "Ответ создания: $create_response" >&2
  exit 1
fi
echo "[нагрузка] тенант: $TENANT_ID"

# У нового тенанта нет НИ ОДНОГО пользователя: `POST /platform/tenants` создаёт только сам
# тенант. Пользователь для замеров заводится напрямую в базе — это стендовая оснастка, а не
# продуктовый путь, и в бою так делать нельзя.
echo "[нагрузка] заводим администратора нагрузочного тенанта (стендовая оснастка)"
"${PSQL_EXEC:-docker exec -i test-postgres psql -U trudskill_stand_app -d trudskill_stand}" \
  -v ON_ERROR_STOP=1 -c "
    insert into iam.users (id, tenant_id, login, email, password_hash, status, display_name, created_at, updated_at)
    select 'u_load_admin', '$TENANT_ID', 'load_admin', 'load_admin@example.invalid',
           password_hash, 'active', 'Нагрузочный администратор', now(), now()
      from iam.users where login = 'tenant_admin' limit 1
    on conflict (id) do nothing;
    insert into iam.user_roles (id, tenant_id, user_id, role_id)
    select 'ur_load_admin', '$TENANT_ID', 'u_load_admin', r.id
      from iam.roles r where r.code = 'tenant_admin' and r.tenant_id = '$TENANT_ID'
    on conflict do nothing;" >/dev/null || true

echo "[нагрузка] вход администратором нагрузочного тенанта"
LOAD_TOKEN="$(login load_admin "$PLATFORM_PASSWORD" "$TENANT_ID")"

echo "[нагрузка] создаём группу под массовый импорт"
GROUP_ID="$(curl -sS -X POST "$BASE_URL/groups" \
  -H 'content-type: application/json' \
  -H "x-tenant-id: $TENANT_ID" \
  -H "authorization: Bearer $LOAD_TOKEN" \
  -d '{"name":"Нагрузочная группа","code":"load-1"}' |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])')"
echo "[нагрузка] группа: $GROUP_ID"

echo "[нагрузка] готовим $LEARNERS слушателей"
python3 - "$LEARNERS" "$GROUP_ID" >"${TMPDIR:-/tmp}/load-learners.json" <<'PY'
import json, sys

count = int(sys.argv[1])
group = sys.argv[2]

# ФИО — ТОЛЬКО кириллица с заглавных букв: проверка на входе отвергает цифры в имени
# (первый прогон дал 500 отказов из 500 именно из-за «Слушатель0001»).
letters = "абвгдежзийклмнопрстуфхцчшщэюя"


def cyr(n, width=3):
    out = ""
    for _ in range(width):
        out = letters[n % len(letters)] + out
        n //= len(letters)
    return out.capitalize()


rows = [
    {
        "rowNumber": i + 2,
        "fullName": f"Нагрузкин {cyr(i)} Тестович",
        "email": f"load{i + 1:04d}@example.invalid",
    }
    for i in range(count)
]
print(
    json.dumps(
        {"idempotencyKey": f"load-seed-{count}", "groupId": group, "rows": rows},
        ensure_ascii=False,
    )
)
PY

echo "[нагрузка] импортируем (обычным массовым импортом, как в бою)"
IMPORT_TOKEN="$LOAD_TOKEN"
curl -sS -X POST "$BASE_URL/learners/bulk-import" \
  -H 'content-type: application/json' \
  -H "x-tenant-id: $TENANT_ID" \
  -H "authorization: Bearer $IMPORT_TOKEN" \
  --data-binary "@${TMPDIR:-/tmp}/load-learners.json" |
  python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)["data"]
    print(f"[нагрузка] импорт: всего={d.get(\"total\")} создано={d.get(\"created\")} повторно={d.get(\"reused\")} отказов={d.get(\"failed\")}")
except Exception as exc:
    print(f"[нагрузка] импорт не разобран: {exc}")'

echo "[нагрузка] готово. Тенант для прогона: $TENANT_ID"
