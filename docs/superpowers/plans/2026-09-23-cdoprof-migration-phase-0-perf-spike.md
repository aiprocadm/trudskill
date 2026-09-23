# Спайк производительности «объём CDOPROF в текущей модели» — план (позиция 3 очереди)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Дата:** 2026-09-23. **ТЗ:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §15.1 (МГ-A3.1, МГ-A4.1 — база «до»), Часть VI п. 3 (PR-3).
**Трекер:** `docs/TZ_CDOPROF_MIGRATION_STATUS.md`, позиция 3. **Апрув:** делегирован (поручение владельца 23.09.2026).

**Goal:** Получить ЧИСЛА — сколько сейчас стоят `GET /groups`, `GET /learners`, `GET /search` на тенанте с 25 000 групп / 14 000 слушателей / 30 000 зачислений в текущей модели хранения (JSON-снимок), чтобы решение по Фазе 1 (нормализованное хранение) принималось по замеру, а не по ощущению. Ожидание ТЗ: подтверждение блокера.

**Architecture:** (1) чистый генератор синтетического тенанта `buildSyntheticCdoprofTenant(shape, seed)` — детерминированный, без ПДн (фамилии из короткого словаря, без СНИЛС/почты/телефона/ДР: иначе первый же `GET /learners` перепишет 14 000 строк из-за «открытых ПДн», а замер станет про запись, а не про чтение); (2) скрипт `apps/backend/scripts/perf-synth.ts` — пишет строки прямо в `learning.mvp_runtime_documents` пачками (это стендовая оснастка: через API 25 000 групп заливались бы часами); (3) k6-сценарий `infra/load/k6-cdoprof-volume.js` с порогом `p95 < 500 мс` (бюджет `apiP95Ms`); (4) отчёт в `docs/LOAD_TEST_RESULTS.md` + трекер.

**Tech Stack:** TypeScript (ESM), `pg` (уже в бэкенде), k6 v0.54 (`~/.local/bin/k6`), Postgres 16 в docker `test-postgres` — ОТДЕЛЬНАЯ база `trudskill_perf` (миграции при старте создадут `tenant_demo` с `tenant_admin`).

**Spec:** ТЗ §15.1 МГ-A3.1: «p95 ≤500 мс на списках и календаре при 25 000 групп / 14 000 слушателей / 30 000 зачислений / 60 000 документов»; §0 п. 3 «главный технический блокер — слой хранения».

## Global Constraints

- Скрипт отказывается работать при `NODE_ENV=production`/`APP_ENV=production` и требует явный `PERF_SYNTH_TENANT_ID`; заливает только в указанный тенант, чужие строки не трогает.
- Числа формы набора — параметры со значением по умолчанию (25 000 / 14 000 / 30 000 / 1 622 / 427), не константы в коде.
- В репозиторий — только числа замера; данные синтетические, ПДн нет по построению.
- Отдельная база; в стендовую (`trudskill_stand`) не заливать (runbook).

## Review Focus

1. Синтетика с открытыми ПДн заставила бы бэкенд перезаписывать слушателей на чтении — генератор не ставит `snils/email/phone/dateOfBirth` (тест в Task 1).
2. Повторный запуск скрипта не должен задваивать строки — перед заливкой удаляются строки ТОЛЬКО этого тенанта и только заливаемых коллекций (тест в Task 2).
3. Каждая ссылка (`enrollment.groupId/learnerId`, `group.counterpartyId`) указывает на существующую сущность — иначе замер поймает ошибки ссылочной целостности вместо задержки (тест в Task 1).
4. `GET /search` живёт под `ThrottlerGuard` 120/мин — k6 не должен упереться в 429 и принять их за отказ: доля поиска в сценарии ограничена (Task 3).
5. Очередь на тенант (`runExclusive`) сериализует запросы — p95 под 10 VU покажет очередь, а не базу; отчёт обязан привести и одиночную задержку (VUS=1), и параллельную (Task 4).

---

### Task 1: Генератор синтетического тенанта

**Files:**

- Create: `apps/backend/src/perf/synthetic-cdoprof-tenant.ts`
- Test: `apps/backend/src/perf/synthetic-cdoprof-tenant.test.ts`

**Interfaces:** `interface SyntheticShape { counterparties; courses; groups; learners; enrollments }`; `DEFAULT_SYNTHETIC_SHAPE`; `buildSyntheticCdoprofTenant(tenantId, shape = DEFAULT, seed = 1): SyntheticTenant` → `{ counterparties: Counterparty[]; courses: Course[]; groups: GroupEntity[]; groupCourses: GroupCourse[]; learners: Learner[]; enrollments: Enrollment[] }`; `toRuntimeRows(tenant): Array<{ collection; id; data }>`.

- [x] Тесты: размеры равны форме; детерминизм (два вызова с одним seed → одинаковый JSON); все ссылки существуют; у слушателей нет `snils/email/phone/dateOfBirth`; `toRuntimeRows` даёт `collection ∈ MVP_COLLECTIONS`; статусы зачислений из допустимого набора.
- [x] Реализация (seeded LCG; коды групп `YYYY-NNNNN`; даты 2021–2026), зелёный, commit.

### Task 2: Скрипт заливки

**Files:**

- Create: `apps/backend/src/perf/runtime-rows-writer.ts` (`writeRuntimeRows(db, tenantId, rows, { batchSize = 1000 })` — транзакция: `delete … where tenant_id=$1 and collection = any($2)` → `insert` пачками; возвращает счётчики) + тест на подставном клиенте (SQL-вызовы: один delete по нужным коллекциям, N/1000 insert, commit; при ошибке — rollback).
- Create: `apps/backend/scripts/perf-synth.ts` (env `DATABASE_URL`, `PERF_SYNTH_TENANT_ID`, `PERF_SYNTH_GROUPS` и т. д.; отказ в production; печать формы и времени заливки).
- Modify: `apps/backend/package.json`, `package.json` (`perf:synth`).

### Task 3: k6-сценарий

- Create: `infra/load/k6-cdoprof-volume.js` — списки `/groups`, `/learners` (страницы 1, 2, 500), `/groups?q=2024-0`, `/learners?q=Ива`, `/search?q=…` (не чаще 1 из 6 итераций); Trend на каждую ручку; пороги `p(95)<LIST_P95_MS` (500) и `http_req_failed<0.01`; VUS/DURATION из env.
- Modify: `infra/load/README.md` — раздел «Объём CDOPROF».

### Task 4: Прогон и отчёт

- [x] База `trudskill_perf` в `test-postgres`; бэкенд из worktree с env стенда, но своей базой и портом 3091 (`MVP_PERSISTENCE_DRIVER=postgres`, `ALLOW_IN_MEMORY_STATE=false`), проверка `/health/ready`.
- [x] `pnpm perf:synth`; токен `tenant_admin`; k6: VUS=1 (одиночная задержка) и VUS=10 (очередь); снять `mvp_persistence_load_duration_ms` из `/metrics`, если доступно.
- [x] `docs/LOAD_TEST_RESULTS.md` — новый раздел «2026-09-23 объём CDOPROF»: таблица p95/среднее по ручкам, время загрузки снимка, размер снимка в базе, вывод для Фазы 1; трекер МГ-A3.1/МГ-A4.1 — база «до»; handoff §5.554; README §2.
- [x] Погасить бэкенд, оставить базу `trudskill_perf` (пригодится Фазе 1 для «после»); `pnpm ci:check`; PR.
