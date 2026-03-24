# Stage 0 — Аудит репозитория и выравнивание под целевую monorepo-архитектуру

_Дата аудита: 2026-03-24_

## 1) Цель этапа

Подтвердить и зафиксировать готовность репозитория к дальнейшей разработке в целевой структуре:

- `apps/frontend`
- `apps/backend`
- `apps/worker`
- `apps/realtime`
- `packages/ui`
- `packages/api-contracts`
- `packages/shared-types`
- `packages/test-utils`

С унифицированными базовыми соглашениями (package manager, workspace, TS, lint/format, scripts, env, infra).

---

## 2) Аудит «как есть»

### 2.1 Верхнеуровневая структура

Обнаружены и валидированы каталоги:

- `apps/`
- `packages/`
- `docs/`
- `infra/`
- `scripts/`
- `tooling/`

### 2.2 Runtime-приложения

- `apps/frontend` — Next.js/React runtime.
- `apps/backend` — NestJS runtime.
- `apps/worker` — worker runtime.
- `apps/realtime` — realtime runtime.

### 2.3 Shared-пакеты

- `packages/ui`
- `packages/api-contracts`
- `packages/shared-types`
- `packages/test-utils`

### 2.4 Базовые конфиги и orchestration

- `package.json` — root scripts + `packageManager: pnpm@9.12.3`.
- `pnpm-workspace.yaml` — workspace-модель.
- `turbo.json` — единая оркестрация задач.
- `tsconfig.base.json` + root `tsconfig.json` — единая TS-иерархия.
- `eslint.config.mjs` + `.prettierrc.json` — единая lint/format база.
- `infra/docker-compose.yml` — единая локальная инфраструктура.

---

## 3) Карта соответствия «как есть» → «как должно быть»

| Целевая сущность | Статус в репозитории | Решение |
|---|---|---|
| `apps/frontend` | уже существует | оставить как канонический frontend runtime |
| `apps/backend` | уже существует | оставить как канонический backend runtime |
| `apps/worker` | уже существует | оставить как канонический worker runtime |
| `apps/realtime` | уже существует | оставить как канонический realtime runtime |
| `packages/ui` | уже существует | оставить как shared UI слой |
| `packages/api-contracts` | уже существует | оставить как контрактный слой |
| `packages/shared-types` | уже существует | оставить как слой общих типов |
| `packages/test-utils` | уже существует | оставить как слой общих test utilities |

Итог: физическая структура уже совпадает с target architecture.

---

## 4) Найденные проблемы и принятые решения

### 4.1 Lock-файлы и пакетный менеджер

- Конфликтующие lock-файлы (`package-lock.json`, `yarn.lock`) в репозитории не обнаружены.
- Единый менеджер пакетов — `pnpm` (зафиксирован в root `package.json`).
- Риск: `pnpm-lock.yaml` отсутствует, т.к. в текущем окружении `pnpm install` завершился ошибкой загрузки pinned pnpm через Corepack (proxy 403).

**Решение:** оставить pnpm как единый стандарт; сгенерировать/закоммитить lockfile в окружении с доступом к npm registry.

### 4.2 Конфиги TypeScript / ESLint / Prettier

- Дублирующих конфликтующих root-конфигов не обнаружено.
- Сохранена единая root-база с локальными app/package `tsconfig` по необходимости.

### 4.3 Docker / infra

- Сохранён один канонический compose-файл: `infra/docker-compose.yml`.
- Дублирующих compose-конфигов не выявлено.

### 4.4 Legacy / мусор / дубли shared-кода

- Параллельных legacy-деревьев вне `apps/*` и `packages/*` не обнаружено.
- Конфликтующих дублей shared пакетов верхнего уровня не обнаружено.

---

## 5) Что изменено в рамках Stage 0 в этом проходе

1. Обновлён `README.md`:
   - зафиксирована итоговая карта monorepo,
   - зафиксированы базовые соглашения,
   - добавлены правила дальнейшего размещения модулей,
   - отражено состояние lockfile.
2. Обновлён этот audit-отчёт (`docs/repo-audit-stage-0.md`) с актуальной фиксацией состояния и решений.

---

## 6) Итоговые соглашения репозитория

- **Package manager:** pnpm.
- **Workspace:** `pnpm-workspace.yaml`.
- **Build/test orchestration:** Turbo.
- **TypeScript:** `tsconfig.base.json` + root references (`tsconfig.json`).
- **Lint/Format:** root `eslint.config.mjs` + `.prettierrc.json`.
- **Runtime separation:** `apps/frontend|backend|worker|realtime`.
- **Shared separation:** `packages/ui|api-contracts|shared-types|test-utils`.

---

## 7) Остаточные риски / technical debt

1. **Отсутствует закоммиченный `pnpm-lock.yaml`** (блокер окружения, не архитектуры).
2. Текущие runtime/package реализации — базовые scaffolds; доменные модули, контрактный пайплайн генерации и dependency-boundary policing будут наращиваться на следующих этапах.

---

## 8) Вердикт готовности к следующему этапу

Репозиторий **готов** к дальнейшей реализации архитектуры платформы:

- целевая monorepo-структура соблюдена,
- runtime и shared-контуры разделены,
- базовые инженерные соглашения унифицированы,
- navigation/governance зафиксированы в README и audit-документации.
