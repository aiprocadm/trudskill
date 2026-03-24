# ENTERPRISE OPERATIONAL PLAN (No-Rewrite Hardening)

Дата: 2026-03-24

## Guiding constraints

1. No massive rewrite.
2. Не ломать текущие working flows.
3. Не удалять существующие функции ради архитектурной «чистоты».
4. Любая новая логика: tenant-aware + permission-aware + audit-aware + documented + tested.
5. Любой stub/mock/deferred участок: либо внутренняя рабочая реализация, либо явно задокументированный gap.

## Phase-by-phase implementation plan

## Phase 1 — Enterprise Operational Audit (завершено в этой волне)

- Создан фактический audit текущего snapshot.
- Зафиксирован разрыв между целевой спецификацией и текущим foundation-состоянием.

## Phase 2 — Consistency Hardening (следующая практическая волна)

### Backend baseline hardening

- Добавить `TenantContextMiddleware` + extraction tenant from auth/session headers.
- Добавить глобальные guards/interceptors:
  - permission checks для read/write/bulk/export/search;
  - correlation-id propagation;
  - normalized error envelope.
- Добавить audit event writer для sensitive actions.
- Добавить `JobContext` propagation (tenant + correlation id) в worker/retries.

### Frontend baseline hardening

- Route-level permission gate.
- Action-level `hidden/disabled` policy standardization.
- Единые loading/error/empty компоненты.
- Unsaved changes guard для форм/мастеров.

## Phase 3 — Role Workspaces / Attention / Tasks / Blockers

- Ввести projection APIs:
  - `GET /api/workspace/:role/summary`
  - `GET /api/tasks/inbox`
  - `GET /api/attention-center`
  - `GET /api/blockers`
- Стандартизировать `next_actions[]`, `blockers[]`, `deep_links[]` модель.
- На frontend: operational landing после login с overdue/blocked/requires-attention.

## Phase 4 — Document Core Hardening

- Ввести unified lifecycle state machine (template→readiness→branding→replace→pdf→approval→sign→edo→archive).
- Добавить deterministic render metadata/snapshots.
- Добавить explicit readiness reasons + recommendations.
- Ввести dependency-map foundations: NPA→template→package→approval-route→rule.
- Гарантировать idempotent reruns + reliable async progress API.

## Phase 5 — Remove Corporate-Blocking Stubs

- Явно маркировать provider mode (`production | internal-simulated | mock`).
- Изолировать adapter boundaries.
- Где внешний оператор недоступен — не маскировать, а включать internal orchestration with audit/retries/statuses/diagnostics.

## Phase 6 — Data Quality + Readiness Blockers

- Ввести движок data quality rules и persistence issues.
- Severity model: critical/high/medium/low.
- Интегрировать issues в document/contractor/employee readiness + attention center.
- Минимальные домены: employees, companies/sites, templates/documents, training, PPE, contractors.

## Phase 7 — PWA / Offline / Field Hardening

- Реализовать/усилить `/api/pwa/bootstrap`.
- Добавить offline queue UX + conflict resolution + retry/resume + sync diagnostics.
- Поддержать ключевые полевые сценарии (briefing, incident draft, checklist draft, task/comment, media sync, training acknowledgement).

## Phase 8 — Operational UX Hardening

- Для приоритетных экранов (admin, contractors, reference, settings, activities, medical, fire safety, inspections, dashboards, client portal):
  - next actions;
  - blockers context;
  - empty states;
  - bulk actions;
  - deep links;
  - primary CTA focus, advanced actions in secondary menu.

## Phase 9 — Enterprise Admin / Governance / Diagnostics

- Tenant health dashboard.
- Outbox/webhook diagnostics.
- Provider mode/integration readiness diagnostics.
- Queue/job diagnostics.
- Audit/data-quality/billing overview.
- Startup readiness / onboarding diagnostics.

## Phase 10 — Reliability / Observability / Runbooks

- Retries policy standardization + DLQ strategy.
- Watchdog/heartbeat.
- Failed job diagnostics.
- Cleanup/integrity checks.
- Расширенный health/readiness coverage.
- Обновленные runbooks + reproducible local bootstrap + CI verification path.

## Phase 11 — Tests (после каждой волны)

- Backend unit + integration.
- Frontend unit/component.
- Contract tests для cross-service boundaries.

Приоритет покрытия:
- tenant isolation;
- authz;
- document lifecycle/readiness;
- blockers/data quality;
- tasks/attention/workspaces;
- workflow/sign/edo orchestration;
- offline sync edge cases.

## Delivery governance

Для каждой волны выпускать:

1. `docs/ENTERPRISE_OPERATIONAL_COMPLETION_REPORT.md`
2. `docs/ENTERPRISE_OPERATIONAL_REMAINING_GAPS.md`
3. `docs/ENTERPRISE_OPERATIONAL_NEXT_STEPS.md`

С обязательной фиксацией:
- что доведено до corporate-usable state;
- что улучшено без rewrite;
- что осталось stub/mock/deferred;
- риски и зависимости следующей волны.
