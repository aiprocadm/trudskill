# ENTERPRISE OPERATIONAL WAVE 1 CHANGELOG

Дата: 2026-04-10

## Что реализовано

### Backend: operational workspace surface

- Добавлены endpoint'ы:
  - `GET /api/v1/workspace/summary`
  - `GET /api/v1/tasks/inbox`
  - `GET /api/v1/blockers`
- Добавлен модуль `workspace` и подключение в `app.module`.
- Реализованы tenant/authz boundary checks для workspace-роутов.

### Backend: guardrails и quality

- Усилены тестовые контуры для:
  - tenant guard
  - permission guard
  - error envelope filter
  - audit service
- Добавлены integration permission-boundary тесты для:
  - workspace
  - documents
- Добавлены contract-тесты workspace projection API (envelope + payload shape).

### Worker/job context

- Стандартизирован job envelope:
  - `tenantId`
  - `correlationId`
  - `actorId`
- Добавлен failure diagnostics payload:
  - `message`
  - `errorName`
  - `retryDecision`

### Frontend: operational workspace + state UX

- Добавлена workspace-страница `app/workspace/page.tsx`.
- Выделены и покрыты тестами state helper'ы:
  - loading
  - error mapping
  - empty states
  - ready/success states
- Проверена совместимость с route permission coverage (`navigation/helpers.test.ts`).

## Что синхронизировано в документации

- Обновлены:
  - `docs/ENTERPRISE_OPERATIONAL_NEXT_STEPS.md`
  - `docs/ENTERPRISE_OPERATIONAL_REMAINING_GAPS.md`
  - `docs/ENTERPRISE_OPERATIONAL_COMPLETION_REPORT.md`

## Результаты тестов, добавленных в волне

- Backend:
  - `workspace.http.integration.test.ts`
  - `workspace.contract.test.ts`
  - `documents.http.integration.test.ts`
  - `tenant.guard.test.ts`
  - `permission.guard.test.ts`
  - `http-exception.filter.test.ts`
  - `audit.service.test.ts`
- Worker:
  - `document-pipeline.test.ts`
- Frontend:
  - `app/workspace/page.test.tsx`
  - `src/features/navigation/helpers.test.ts`

## Оставшиеся зоны следующей волны

- Полный role-based dashboard/attention center.
- Расширение document lifecycle/readiness контуров.
- Admin diagnostics (tenant health, queue center, integration readiness).
- End-to-end observability/reliability (DLQ/watchdog/cleanup).
