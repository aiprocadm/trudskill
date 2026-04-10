# ENTERPRISE OPERATIONAL NEXT STEPS (Wave 1 Proposal)

Дата: 2026-04-10

## Objective of Wave 1

Создать минимальный enterprise-core слой без rewrite, на который безопасно наращиваются остальные фазы.

## Target outcomes (Wave 1)

1. Backend tenant/authz/audit/error/correlation baseline внедрен и покрыт тестами.
2. Frontend permission-aware routing/actions + единые loading/error/empty patterns.
3. Минимальный workspace projection API (tasks + blockers + next actions) для одного пилотного домена.
4. Документация runbook-level по новым guardrails.

## Concrete backlog

### 1) Backend guardrails

Статус: частично реализовано в runtime (tenant/authz/error/correlation/audit baseline), но не закрыто end-to-end для всех контуров.

- [ ] Tenant context middleware/interceptor.
- [ ] Permission guard + policy helper.
- [ ] Global exception filter with normalized error envelope.
- [ ] Correlation-id interceptor и logging propagation.
- [ ] Audit event publisher for sensitive actions.

### 2) Worker/job context

- [x] Standard job envelope: `tenantId`, `correlationId`, `actorId`.
- [x] Retry policy baseline + failure diagnostics payload.

### 3) Frontend consistency

Статус: частично реализовано для workspace маршрута и state UX, остается масштабирование на остальные доменные экраны.

- [ ] Route guard helper (`requiresPermissions[]`).
- [ ] Action guard component/hook with hidden/disabled policy.
- [ ] Shared state components: loading/error/empty.
- [ ] Unsaved changes protection helper.

### 4) Operational pilot surface

- [x] `GET /api/workspace/summary` (minimal projection).
- [x] `GET /api/tasks/inbox` (minimal projection).
- [x] `GET /api/blockers` (minimal projection).
- [x] Frontend workspace page with next actions/deep links.

### 5) Tests and quality gates

- [x] Backend unit tests (tenant/authz/error/audit).
- [x] Backend integration tests (permission boundaries).
- [x] Frontend tests (route/action guards, state UX).
- [x] Contract tests для новых projection API.

## Definition of Done (Wave 1)

Wave 1 считается завершенной только если одновременно выполнены:

1. Все новые endpoint/actions tenant-safe и permission-safe.
2. Sensitive actions создают audit-event с correlation-id.
3. Ошибки возвращаются единым envelope.
4. Есть не менее одного operational workspace экрана, показывающего overdue/blockers/next actions.
5. Обновлены docs audit/plan/completion/gaps/next-steps.
