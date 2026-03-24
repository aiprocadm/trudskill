# @cdoprof/frontend

Единое shell-приложение платформы на Next.js + React + TypeScript.

## Структура

- `app/` — маршруты (login, protected modules, forbidden, not-found, global error/loading).
- `src/lib/api` — typed API client и нормализация API-ошибок.
- `src/lib/auth` — login/logout/bootstrap/refresh lifecycle и session storage.
- `src/lib/rbac` — permission helpers.
- `src/lib/query` — QueryClient и policy ретраев.
- `src/features/auth` — auth context, guards, login form, route bootstrap state helper.
- `src/features/navigation` — route metadata и RBAC-aware navigation model.
- `src/widgets/shell` — app shell (sidebar/topbar/session area/placeholders).
- `src/components` — foundation wrappers: page container/header, loading/empty/error, section cards, forms/registry placeholders.

## Env

Используются переменные:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_REALTIME_URL`
- `PUBLIC_BASE_URL`
- `NEXT_PUBLIC_DEFAULT_TENANT_ID` (опционально, по умолчанию `tenant_demo`)

См. `.env.example`.

## Запуск

```bash
pnpm install
pnpm --filter @cdoprof/frontend dev
```

## Тесты

```bash
pnpm --filter @cdoprof/frontend test
pnpm --filter @cdoprof/frontend typecheck
```

Покрыты foundation-сценарии: auth/session refresh/logout reset, protected routing, forbidden logic, permission-aware navigation и error normalization.

## Принципы auth/session/routing

- Все auth-вызовы централизованы в `src/lib/auth`.
- Protected/public доступ вычисляется через route metadata patterns + `evaluateRouteAccess`/`getRouteBootstrapState`.
- Меню строится через RBAC (`getVisibleNavigation`).
- При невозможности refresh сессия очищается и пользователь должен повторно пройти login.
