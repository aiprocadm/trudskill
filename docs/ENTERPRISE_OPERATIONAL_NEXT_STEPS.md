# ENTERPRISE OPERATIONAL NEXT STEPS (Wave 1 Proposal)

Дата: 2026-03-24

## Objective of Wave 1

Создать минимальный enterprise-core слой без rewrite, на который безопасно наращиваются остальные фазы.

## Target outcomes (Wave 1)

1. Backend tenant/authz/audit/error/correlation baseline внедрен и покрыт тестами.
2. Frontend permission-aware routing/actions + единые loading/error/empty patterns.
3. Минимальный workspace projection API (tasks + blockers + next actions) для одного пилотного домена.
4. Документация runbook-level по новым guardrails.

## Concrete backlog

### 1) Backend guardrails

- [ ] Tenant context middleware/interceptor.
- [ ] Permission guard + policy helper.
- [ ] Global exception filter with normalized error envelope.
- [ ] Correlation-id interceptor и logging propagation.
- [ ] Audit event publisher for sensitive actions.

### 2) Worker/job context

- [ ] Standard job envelope: `tenantId`, `correlationId`, `actorId`.
- [ ] Retry policy baseline + failure diagnostics payload.

### 3) Frontend consistency

- [ ] Route guard helper (`requiresPermissions[]`).
- [ ] Action guard component/hook with hidden/disabled policy.
- [ ] Shared state components: loading/error/empty.
- [ ] Unsaved changes protection helper.

### 4) Operational pilot surface

- [ ] `GET /api/workspace/summary` (minimal projection).
- [ ] `GET /api/tasks/inbox` (minimal projection).
- [ ] `GET /api/blockers` (minimal projection).
- [ ] Frontend workspace page with next actions/deep links.

### 5) Tests and quality gates

- [ ] Backend unit tests (tenant/authz/error/audit).
- [ ] Backend integration tests (permission boundaries).
- [ ] Frontend tests (route/action guards, state UX).
- [ ] Contract tests для новых projection API.

## Definition of Done (Wave 1)

Wave 1 считается завершенной только если одновременно выполнены:

1. Все новые endpoint/actions tenant-safe и permission-safe.
2. Sensitive actions создают audit-event с correlation-id.
3. Ошибки возвращаются единым envelope.
4. Есть не менее одного operational workspace экрана, показывающего overdue/blockers/next actions.
5. Обновлены docs audit/plan/completion/gaps/next-steps.
