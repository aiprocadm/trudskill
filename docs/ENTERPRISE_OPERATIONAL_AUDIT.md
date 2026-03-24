# ENTERPRISE OPERATIONAL AUDIT (Wave 0)

Дата аудита: 2026-03-24  
Контур: текущий snapshot репозитория `/workspace/cdoprof-`  
Роль: senior full-stack engineer / enterprise platform hardening lead

## 1) Executive summary

Текущее состояние репозитория — **platform foundation / stage-1 scaffold**, а не operational SaaS enterprise-система. Это подтверждается структурой кода: минимальный NestJS backend с одним health endpoint, минимальный Next.js frontend с одной демонстрационной страницей и отсутствием доменных модулей (documents, approvals, EDO, incidents, PPE, training, billing, CRM, client portal и т.д.).

Итог: перед hardening-фазами 2–10 требуется фактическое наращивание функционального baseline (tenant-aware domain APIs, authz, audit, jobs, projections, dashboards), иначе platform-wide consistency и operational UX невозможно полноценно применить.

## 2) Методика фактической проверки

Проверка выполнена через:

- инвентаризацию файлов в `apps/` и `packages/`;
- сверку ключевых runtime-файлов backend/frontend;
- сверку API contracts и shared-types;
- поиск заявленных enterprise-файлов/маршрутов из целевой спецификации.

## 3) Operational usability по экранам

### 3.1 Экраны, уже operationally usable

На текущем snapshot подтвержден только базовый демонстрационный экран:

- `apps/frontend/app/page.tsx` — отображает env-параметры и demo-card; пригоден как smoke/demo, **не** как рабочий enterprise-экран.

### 3.2 Projection / foundation screens

- `apps/frontend/app/page.tsx` — foundation-level экран (демо).
- Остальные приоритетные operational-экраны из ТЗ (admin/contractors/reference/settings/activities/medical/fire safety/fire training/inspections/dashboard/client portal и др.) в репозитории отсутствуют.

## 4) Backend маршруты/сервисы: stub/mock/deferred

### 4.1 Фактически обнаруженные backend маршруты

- `GET /health` в `apps/backend/src/app.module.ts`.

### 4.2 Stub/mock/deferred по текущему snapshot

- В backend отсутствуют специализированные доменные маршруты и orchestration сервисы.
- В текущем коде не найдено явных production-stub/mock модулей уровня document/approval/edo, т.к. сами домены пока не реализованы.

## 5) Role-based workspaces, tasks, attention, blockers

- Role-based workspace APIs: отсутствуют.
- Task inbox / attention center / blockers projections: отсутствуют.
- Deep links / next actions / bulk actions / empty states на доменных страницах: неприменимо (страницы отсутствуют).

## 6) Tenant / authz / audit / errors consistency

### 6.1 Tenant-awareness

- В `packages/shared-types` есть базовый тип `TenantAware`, но в runtime backend нет tenant context enforcement middleware/guard.

### 6.2 Authorization / permission model

- Глобальная и route-level authz система в backend/frontend отсутствует.

### 6.3 Audit

- Базовый интерфейс `Auditable` присутствует в shared-types, но runtime audit trail отсутствует.

### 6.4 Error normalization + correlation-id

- В API contracts определен тип `ApiError`, однако отсутствуют глобальные exception filters/interceptors и корреляционный контекст в runtime backend.

## 7) Architecture debt / fat files / duplicate boundaries

- Fat files: критических не выявлено (кодовая база минимальна).
- Duplicate boundaries: не выявлено; архитектурный риск сейчас противоположный — **недостаточная функциональная декомпозиция** (доменные границы не реализованы).

## 8) Подтвержденные факты (обязательная проверка из ТЗ)

Ниже перечислены требуемые для проверки факты и их статус в текущем snapshot.

| Факт из ТЗ | Статус в текущем репозитории | Комментарий |
|---|---|---|
| `backend/app/api/routes/ws_stub.py` = deferred websocket | **Не найдено** | Python backend structure отсутствует; используется NestJS (`apps/backend/src`). |
| `backend/app/celery/tasks/document_jobs_required.py` = deferred semantics | **Не найдено** | Celery контур отсутствует. |
| `backend/app/services/pipeline_step_handlers.py` = deferred stages | **Не найдено** | Python services tree отсутствует. |
| `backend/app/services/integrations/stubs.py` = stub providers | **Не найдено** | Не найдено соответствующего пути/модуля. |
| `backend/app/api/routes/approval_signing_v1.py` = stub/internal-fallback provider path | **Не найдено** | Approval API в snapshot отсутствует. |
| `backend/app/api/routes/approval_orchestration.py` = mock provider path | **Не найдено** | Orchestration route отсутствует. |
| `backend/app/api/routes/edo_workflow.py` = mock/stub semantics | **Не найдено** | EDO workflow route отсутствует. |
| `frontend/vite.config.ts` already has `vite-plugin-pwa` | **Не найдено** | Frontend на Next.js, файла `vite.config.ts` нет. |
| `/api/pwa/bootstrap` returns user/permissions/dictionaries/offline/sync/diagnostics | **Не найдено** | PWA bootstrap API route в snapshot отсутствует. |
| many pages use real snapshot APIs but need maturity | **Не подтверждено** | Большинство domain pages отсутствуют. |

## 9) Итоговый аудит-рейтинг (Wave 0)

- Product functionality maturity: **1/10** (foundation scaffold).
- Enterprise operational maturity: **1/10**.
- Tenant safety maturity: **2/10** (только типы, без runtime enforcement).
- Permission safety maturity: **1/10**.
- Operational readiness (admin/diagnostics/runbooks): **1/10**.

## 10) Рекомендация по стратегии

Вместо rewrite предлагается **incremental hardening-by-slices**:

1. Сначала сформировать минимально жизнеспособный enterprise-core (tenant/authz/audit/error/correlation/job-context).
2. Затем добавить role workspace/task/blocker projections и operational dashboards.
3. Параллельно укреплять document core и non-production provider mode transparency.
4. После каждой волны — фиксировать completion + remaining gaps + next steps.
