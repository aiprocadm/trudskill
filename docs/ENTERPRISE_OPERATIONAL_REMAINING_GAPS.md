# ENTERPRISE OPERATIONAL REMAINING GAPS

Дата: 2026-04-10

## A. Platform safety and consistency

1. Частично закрыто: tenant context enforcement есть в HTTP runtime (`TenantGuard` + request context), но не доведен до всех фоновых/интеграционных контуров.
2. Частично закрыто: permission model реализован для ключевых endpoint'ов (в т.ч. workspace/documents), но не завершен для всех сценариев route/action/bulk/export/search.
3. Частично закрыто: audit сервис и доменные вызовы присутствуют, но покрытие sensitive действий и операционные представления аудит-данных остаются неполными.
4. Частично закрыто: correlation-id есть в HTTP envelope/interceptors; end-to-end propagation через jobs/integrations и внешние контуры неполная.
5. Частично закрыто: standardized error envelope применен в backend runtime; требуется расширение consistency по всем модулям и edge-case потокам.

## B. Enterprise operations UX

1. Нет role-based dashboards/workspaces.
2. Частично закрыто: есть базовые `tasks inbox` и `blockers` projection endpoint'ы + workspace summary; отсутствует полноценный attention center и role-based operational dashboard.
3. Частично закрыто: есть базовые deep links/next actions в workspace projection; отсутствует зрелый доменный контур action orchestration.
4. Частично закрыто: для workspace реализованы и протестированы loading/error/empty patterns; на остальных доменных экранах унификация не завершена.

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
2. Частично закрыто: в worker добавлен базовый failure diagnostics payload (`message`, `errorName`, `retryDecision`), но нет единого diagnostics центра/дашборда.
3. Нет integration readiness / provider mode dashboard.
4. Нет audit/data-quality/billing overview.

## H. Reliability/observability/runbooks

1. Нет стандартизированного retries/DLQ/poison handling.
2. Нет watchdog/heartbeat.
3. Нет failed job diagnostics + cleanup/integrity checks.
4. Runbooks для enterprise-эксплуатации не сформированы.

## I. Test coverage

1. Недостаток unit/integration/contract coverage для enterprise-сценариев (при этом уже добавлены backend unit-тесты guardrails, integration permission-boundary тесты для workspace/documents, projection contract tests и frontend state UX tests для workspace).
2. Отсутствует coverage по tenant isolation/authz/document lifecycle/readiness/blockers/offline edge cases.
