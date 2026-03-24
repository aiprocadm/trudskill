# ENTERPRISE OPERATIONAL REMAINING GAPS

Дата: 2026-03-24

## A. Platform safety and consistency

1. Tenant context enforcement отсутствует на backend runtime уровне.
2. Permission model отсутствует (route/action/bulk/export/search).
3. Audit trail отсутствует для sensitive действий.
4. Correlation-id propagation отсутствует end-to-end.
5. Standardized error model в runtime не применен глобально.

## B. Enterprise operations UX

1. Нет role-based dashboards/workspaces.
2. Нет task inbox / attention center / blockers feed.
3. Нет operational deep links / next actions.
4. Нет унифицированных empty/loading/error states на доменных экранах.

## C. Document-centered enterprise engine

1. Нет сквозного document lifecycle orchestration.
2. Нет readiness score/reasons/recommendations.
3. Нет dependency map (NPA→template→package→approval route→rule).
4. Нет deterministic render metadata/snapshots pipeline.

## D. Stub/mock/deferred governance

1. Нет явного provider-mode diagnostics контура.
2. Нет internal orchestration fallback для approval/sign/edo/pipeline jobs (в текущем snapshot эти контуры отсутствуют полностью).

## E. Data quality / readiness blockers

1. Нет data quality rules engine.
2. Нет persistence issues/blockers severity model.
3. Нет интеграции blockers в workspaces/attention/readiness.

## F. PWA / offline / field

1. Нет подтвержденного PWA bootstrap API и offline orchestration.
2. Нет conflict resolution / retry-resume / sync diagnostics UX.

## G. Admin/governance/diagnostics

1. Нет tenant health центра.
2. Нет queue/job diagnostics.
3. Нет integration readiness / provider mode dashboard.
4. Нет audit/data-quality/billing overview.

## H. Reliability/observability/runbooks

1. Нет стандартизированного retries/DLQ/poison handling.
2. Нет watchdog/heartbeat.
3. Нет failed job diagnostics + cleanup/integrity checks.
4. Runbooks для enterprise-эксплуатации не сформированы.

## I. Test coverage

1. Недостаток unit/integration/contract coverage для enterprise-сценариев.
2. Отсутствует coverage по tenant isolation/authz/document lifecycle/readiness/blockers/offline edge cases.
