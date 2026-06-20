# Phase 7 — Payment provider seam (dormant foundation) — Design

**Date:** 2026-06-20
**Branch (planned):** `feat/2026-06-20-phase-7-payment-provider-seam`
**Status:** Design approved, awaiting plan
**Roadmap:** Phase 7 «Оплаты» (см. `docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md` §Phase 7)

## Context

Платежи — пункт **роадмапа**, а НЕ подписанного ТЗ (`SDOPROF_TZ_FINAL.md` платежей не содержит). Поэтому
есть свобода в выборе глубины: эта итерация строит **provider-agnostic dormant payment seam** —
внутреннюю модель «заказ/платёж» + спящий шов провайдера, по проверенному паттерну последних 4 интеграций
(антивирус → esign-НЭП → export-КЭП → ЕСИА). Реальная активация (ЮKassa, 54-ФЗ) — follow-up за тем же токеном.

Доступ к курсу сейчас даёт **зачисление** (`MvpService.createEnrollment` / `createBulkEnrollments`,
инициирует админ/куратор). Гейты (идентификация/прокторинг) защищают только итоговый экзамен, не доступ.
Платёж стыкуется как **новый способ привести к зачислению** (fulfillment: `paid` → enrollment), не как ещё один гейт.

## Approved decisions

| #             | Решение                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Цель          | Provider-agnostic **dormant** payment seam (деньги не двигаются в этой итерации)                 |
| Инициация     | B2C self-serve **+** admin-driven (общая order-модель)                                           |
| Гранулярность | Заказ с позициями (line items): 1 ученик = 1 позиция; N = `createBulkEnrollments`                |
| Хранение      | Durable Postgres, схема `payments`, миграция **0054**, права `payments.read/write/self_purchase` |
| Подход        | **A** — шов + ручная отметка безнала + Noop/Fake провайдеры; модуль изолирован от `MvpService`   |

## Architecture

Новый модуль `apps/backend/src/modules/payments/` (зеркало `esign`):
`payments.module.ts`, `payments.controller.ts`, `payments.service.ts`, `payment-fulfillment.service.ts`,
`payments.types.ts`, `payments.dto.ts`, state-machine + тесты.

Финансовый домен изолирован от раздутого `MvpService` (>3700 строк). Стыковка с зачислениями — через
вызов существующих `MvpService.createEnrollment` / `createBulkEnrollments` (не дублируем enrollment-логику).

Провайдер-шов: `apps/backend/src/infrastructure/payments/` (зеркало `infrastructure/export-signature/`).

## Data model — migration 0054 (schema `payments`)

### `payments.orders`

`id, tenant_id, buyer_type('learner'|'counterparty'), buyer_id, status, currency('RUB' default),
total_amount (integer, копейки), description, created_by, created_at, updated_at`

### `payments.order_items`

`id, tenant_id, order_id, course_version_id, learner_id, unit_amount (integer, копейки),
fulfillment_status('pending'|'enrolled'|'skipped'), enrollment_id (nullable)`

Одна позиция = одна пара `(course_version, learner)` → одно зачисление.
B2C self = заказ из 1 позиции; B2B = N позиций. Fulfillment группирует позиции по курсу → `createBulkEnrollments`.

### `payments.payments`

`id, tenant_id, order_id, provider('manual'|'noop'|'fake'|'yookassa'), provider_payment_id (nullable),
method('bank_transfer'|'card'), status, amount (integer, копейки), confirmation_url (nullable),
paid_at (nullable), idempotency_key, raw_payload (jsonb), created_at, updated_at`

### Деньги

Все суммы — **integer в копейках** (никаких float; `150000` = 1500 ₽). Конвертация копейки↔строка-с-2-знаками
(формат ЮKassa) происходит ТОЛЬКО на границе провайдер-адаптера; внутри домена всё целочисленное.

### Права (та же миграция)

- `payments.read` / `payments.write` — admin/менеджер.
- `payments.self_purchase` — роль learner (создать/оплатить/смотреть свой заказ).

## State machines

- **`Order.status`**: `draft → awaiting_payment → paid → fulfilled`; ветка `cancelled` (из draft/awaiting_payment).
- **`Payment.status`**: `pending → succeeded`; ветки `failed`, `cancelled`, `refunded` (refunded зарезервирован, flow не строится).

Успешный платёж (онлайн ИЛИ ручная отметка) → `order.status=paid` → fulfillment → `order.status=fulfilled`.

## Provider seam

```ts
export interface CreatePaymentParams {
  tenantId: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
}
export interface CreatePaymentResult {
  providerPaymentId: string;
  status: 'pending' | 'disabled';
  confirmationUrl?: string;
}
export interface WebhookEvent {
  providerPaymentId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly id: string; // 'noop' | 'fake' | 'yookassa'
  createPayment(p: CreatePaymentParams): Promise<CreatePaymentResult>;
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null>; // верификация подписи внутри
}
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
```

- **`NoopPaymentProvider`** (дефолт) — `createPayment` → `{ status: 'disabled' }`; онлайн-оплата недоступна,
  ручная отметка работает. `parseWebhook` → `null` (no-op).
- **`FakePaymentProvider`** — синтетический `confirmationUrl` + фейковый `providerPaymentId` (`fake-pay://`),
  фейковый webhook для подтверждения. **Запрещён в `NODE_ENV=production`** (env-refinement, зеркало export-sign `fake`).
  Для staging-превью полного цикла без ЮKassa.
- **ЮKassa-адаптер** — follow-up за тем же токеном (CSP не нужен; нужны боевые shopId/secretKey + договор + ОФД).

### Env (dormant)

`PAYMENTS_ENABLED=false`, `PAYMENTS_PROVIDER=noop`, `PAYMENTS_CURRENCY=RUB`.
Фабрика в `PaymentsModule` выбирает провайдер: Noop пока `!PAYMENTS_ENABLED`; `fake` под prod-guard. Тест `env.payments.test.ts`.

## API (`PaymentsController`, `@UseGuards(TenantGuard)` + per-endpoint права)

| Endpoint                         | Право                     | Назначение                                                                                                                 |
| -------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /orders`                   | `payments.write`          | создать заказ (admin)                                                                                                      |
| `POST /me/orders`                | `payments.self_purchase`  | B2C: ученик создаёт свой заказ                                                                                             |
| `GET /orders`, `GET /orders/:id` | `payments.read`           | список / деталь                                                                                                            |
| `GET /me/orders`                 | `payments.self_purchase`  | история платежей ученика                                                                                                   |
| `POST /orders/:id/pay`           | `write` / `self_purchase` | инициировать онлайн-оплату → `confirmationUrl` (noop → 503 disabled)                                                       |
| `POST /orders/:id/mark-paid`     | `payments.write`          | **ручная отметка безнала** → `manual`-платёж `succeeded` → fulfillment                                                     |
| `POST /orders/:id/cancel`        | `payments.write`          | отмена                                                                                                                     |
| `POST /payments/webhook`         | **без guard**             | провайдер верифицирует подпись; резолв заказа по `provider_payment_id` (→ tenant из строки платежа); переход + fulfillment |

**Webhook без TenantGuard** (зеркало unguarded SCORM-content-роута): провайдер не носит JWT/`x-tenant-id`,
бьёт по публичному URL. Тенант берётся из ранее сохранённой строки платежа (`provider_payment_id → tenant_id`),
аутентичность даёт верификация подписи внутри адаптера. Noop → `200` no-op.

## Fulfillment (`PaymentFulfillmentService`, идемпотентный)

`payment succeeded` → `order.status=paid` → группировка позиций по `course_version_id` → `createBulkEnrollments`
per группа → проставить `enrollment_id`/`fulfillment_status='enrolled'` → `order.status=fulfilled`.

- Идемпотентность на ретраях webhook: гарды по статусу заказа/платежа + существующая idempotency зачислений.
- Сбой fulfillment **не теряет** факт оплаты: заказ остаётся `paid`, fulfillment ретраится (fail-soft, как у esign/export-sign).

## Frontend (`apps/frontend/src/features/payments/`)

- **Админ** `/admin/orders`: список (`DataTable`/`@cdoprof/ui`, статус-чипы), форма создания (ученик/контрагент +
  позиции курс×ученик + сумма), действия `mark-paid` / `cancel`. Мутации — `useState`+async (`useDomainMutations.wrap`, не React Query).
- **Ученик**: секция «История платежей» (`GET /me/orders`) + кнопка «Оплатить» (dormant → «Онлайн-оплата временно недоступна» при Noop).
  Статус plain-`<span>` (не StatusChip), как §5.131.
- **Навигация**: записи в `features/navigation/model.ts` (`routeMeta` + `navigationModel`); admin под `payments.read`, ученик под `payments.self_purchase`.

## Testing

- `payments.service.test.ts` — lifecycle заказа, машины состояний, ручная отметка.
- `payment-fulfillment.service.test.ts` — paid→enroll, группировка по курсу, ретрай-идемпотентность, fail-soft.
- `*.dto-validation.test.ts` — формы заказа/позиций (копейки-integer `@Min`, `@ArrayMaxSize`, `@ValidateNested`).
- `payments.http.integration.test.ts` — границы прав 8 эндпоинтов + unguarded webhook (резолв тенанта по `provider_payment_id`).
- `env.payments.test.ts` — парс `PAYMENTS_*` + prod-guard `fake`.
- `noop`/`fake`-provider unit-тесты; migration 0054 тест.
- Frontend: `api.contract.test.ts` (envelope-unwrap) + e2e permission/routing (без `render()`).

## Scope boundaries (YAGNI — отдельные spec'ы)

- ❌ Реальный **ЮKassa-адаптер** (договор + боевые ключи).
- ❌ **Чек 54-ФЗ** (онлайн-касса / ОФД) — отдельная подсистема поверх платежа.
- ❌ **Счёт/акт PDF** для B2B (через documents-pipeline) — отдельный spec.
- ❌ **Checkout-лендинг** B2C (маркетинг) — отдельный spec.
- ❌ **Возвраты/рефанды** — статус `refunded` зарезервирован, flow не строится.

## Deliverable summary

Durable order/payment-домен + спящий провайдер-шов (Noop дефолт, Fake для staging) + **рабочая ручная
отметка безнала** + идемпотентный fail-soft fulfillment в зачисления + минимальный UI (админ-заказы +
история ученика). Активация ЮKassa / 54-ФЗ / PDF / лендинг — следующими итерациями поверх готового шва.

Миграция: **0054** (последняя на main — 0053). Новые права: `payments.read/write/self_purchase`.
