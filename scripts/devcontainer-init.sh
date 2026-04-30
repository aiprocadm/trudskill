#!/usr/bin/env bash
# Dev Container / Codespaces: pnpm deps + .env под docker-compose имена сервисов.
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v corepack >/dev/null 2>&1; then
  corepack enable
  PKG_MGR="$(node -p "require('./package.json').packageManager || 'pnpm'" 2>/dev/null || echo "pnpm")"
  if [[ "$PKG_MGR" == pnpm@* ]]; then
    corepack prepare "$PKG_MGR" --activate
  fi
fi

pnpm install

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

sed -i.bak \
  -e 's|postgresql://postgres:postgres@localhost:|postgresql://postgres:postgres@postgres:|g' \
  -e 's|postgresql://postgres:postgres@127\.0\.0\.1:|postgresql://postgres:postgres@postgres:|g' \
  -e 's|redis://localhost:|redis://redis:|g' \
  -e 's|redis://127\.0\.0\.1:|redis://redis:|g' \
  -e 's|amqp://guest:guest@localhost:|amqp://guest:guest@rabbitmq:|g' \
  -e 's|amqp://guest:guest@127\.0\.0\.1:|amqp://guest:guest@rabbitmq:|g' \
  -e 's|http://localhost:9000|http://minio:9000|g' \
  .env || true
rm -f .env.bak

if [[ -n "${CODESPACE_NAME:-}" ]] && [[ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  D="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  ORIGIN="https://${CODESPACE_NAME}-3000.${D}"
  API_BASE="https://${CODESPACE_NAME}-3001.${D}"
  REALTIME_WSS="wss://${CODESPACE_NAME}-3002.${D}"
  mkdir -p apps/frontend
  cat > apps/frontend/.env.local <<EOF
NEXT_PUBLIC_API_BASE_URL=${API_BASE}/api/v1
NEXT_PUBLIC_REALTIME_URL=${REALTIME_WSS}
PUBLIC_BASE_URL=${ORIGIN}
NEXT_PUBLIC_DEFAULT_TENANT_ID=tenant_demo
EOF
  sed -i.bak \
    -e "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=${ORIGIN}|" \
    -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=${ORIGIN}|" \
    -e "s|^BACKEND_PUBLIC_URL=.*|BACKEND_PUBLIC_URL=${API_BASE}|" \
    -e "s|^REALTIME_PUBLIC_URL=.*|REALTIME_PUBLIC_URL=https://${CODESPACE_NAME}-3002.${D}|" \
    -e "s|^NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=${API_BASE}/api/v1|" \
    -e "s|^NEXT_PUBLIC_REALTIME_URL=.*|NEXT_PUBLIC_REALTIME_URL=${REALTIME_WSS}|" \
    .env || true
  rm -f .env.bak
else
  mkdir -p apps/frontend
  if [[ ! -f apps/frontend/.env.local ]] && [[ -f apps/frontend/.env.example ]]; then
    cp apps/frontend/.env.example apps/frontend/.env.local
  fi
fi

echo ""
echo "Готово. Запуск web: pnpm dev:web"
