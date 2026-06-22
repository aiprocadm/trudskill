# Phase 7 activation — payments multi-provider (ЮKassa + Т-Касса + CloudPayments + Robokassa) — Design

**Date:** 2026-06-22
**Branch (planned):** `feat/2026-06-22-phase-7-payments-multi-provider`
**Status:** Design approved, awaiting plan
**Builds on:** Phase 7 payment seam (§5.133, `2026-06-20-phase-7-payment-provider-seam-design.md`)
**Mirrors:** Phase 8 webinar multi-provider per-tenant pattern (§5.134, `2026-06-20-phase-8-webinar-provider-seam-design.md`)

## Context

Phase 7 (§5.133, merged #262) shipped a **dormant** payment seam: an order/payment domain, a single
`PAYMENT_PROVIDER` token resolved from env (`PAYMENTS_PROVIDER` enum), a working manual `mark-paid`
flow, and `Noop`/`Fake` providers. Online payment was a stub: the factory `warn → Noop` for
`yookassa` because no real adapter existed.

This iteration **activates online payment** and, per owner decision, makes the provider **multi-provider
and per-tenant** — exactly the correction the owner applied to webinars in Phase 8. ЮKassa is **not** the
single hard-wired provider; the system supports **different acquirers** plugged into a registry, and each
tenant (учебный центр) chooses which one through settings.

### Owner decisions (brainstorming 2026-06-22)

| #                             | Decision                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Direction                     | Activate Phase 7 by writing real acquirer adapters behind the existing seam                           |
| Provider model                | **Multi-provider + per-tenant selection** (registry + resolver), mirroring Phase 8 webinars           |
| Merchant model                | **One platform merchant** this iteration: acquirer credentials live in **env**, shared by all tenants |
| Per-tenant own merchant       | Deferred to a separate spec (needs encrypted per-tenant secret storage)                               |
| Real adapters now             | **All four: ЮKassa, Т-Касса (Tinkoff), CloudPayments, Robokassa** + registry open for more            |
| Webhook authenticity (ЮKassa) | **Re-fetch payment status from the API (source of truth) + IP-allowlist defense-in-depth**            |
| Scope                         | Full working adapters (real HTTP, unit-tested with mocked `fetch`), not stubs                         |

## Architecture

Refactor the payment seam from a **single env-selected token** to a **registry of strategies + a
per-tenant resolver**, identical in shape to the webinar seam. Because credentials are **system-level
(env)**, the registry holds ready-constructed singleton instances (no per-tenant credential injection at
call time) — the same simplification webinars enjoy.

### Seam: `infrastructure/payments/payment.provider.ts` (refactor)

```ts
export type PaymentProviderCode =
  | 'noop'
  | 'fake'
  | 'yookassa'
  | 'tinkoff'
  | 'cloudpayments'
  | 'robokassa';

export interface CreatePaymentParams {
  tenantId: string;
  orderId: string;
  amount: number; // integer kopecks
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
  readonly code: PaymentProviderCode; // renamed from `id` for parity with WebinarProvider.code
  createPayment(p: CreatePaymentParams): Promise<CreatePaymentResult>;
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null>; // verifies authenticity internally; null = reject / no-op
  /**
   * Optional provider-specific webhook ACK. The acquirer retries unless it receives the exact
   * body it expects (Robokassa: `OK{InvId}`, Tinkoff: `OK`, CloudPayments: `{code:0}`, ЮKassa: 200).
   * Returns the response body the controller should send. Default (omitted) → `{ ok: true }`.
   */
  webhookAck?(event: WebhookEvent | null, raw: Buffer): string | Record<string, unknown>;
}

/** DI token for the registry of all compiled-in providers. Mirrors WEBINAR_PROVIDER_REGISTRY. */
export const PAYMENT_PROVIDER_REGISTRY = Symbol('PAYMENT_PROVIDER_REGISTRY');
export type PaymentProviderRegistry = Map<PaymentProviderCode, PaymentProvider>;
```

`NoopPaymentProvider` (`code='noop'`) stays the safe default. The single `PAYMENT_PROVIDER` token and the
`id` field are **removed** (call sites migrated below). `FakePaymentProvider` (`code='fake'`) keeps its
synthetic confirmation URL + JSON webhook for staging E2E.

### Per-tenant resolver: `modules/payments/payment-provider-resolver.service.ts` (new)

Mirror of `WebinarProviderResolver`:

```ts
async forTenant(tenantId: string): Promise<PaymentProvider> {
  if (!this.enabledGlobally) return this.noop;           // PAYMENTS_ENABLED master switch
  const cfg = await this.settings.get(tenantId);
  if (!cfg.enabled || cfg.providerCode === 'noop') return this.noop;
  if (cfg.providerCode === 'fake' && this.nodeEnv === 'production') return this.noop; // prod-guard
  return this.registry.get(cfg.providerCode) ?? this.noop;
}
```

The prod-guard for `fake` lives **here**, not in an env refinement (env no longer names the active
provider — it is per-tenant).

### Per-tenant settings: `modules/payments/payment-provider-settings.{service,repository}.ts` (new)

Mirror of `webinar-provider-settings.*`. **Non-secret config only** (`provider_code`, `enabled`).
`get(tenantId)` returns the saved row or a safe default (`noop`, disabled). In-memory + Postgres repos,
selected by `ALLOW_IN_MEMORY_STATE` like every other repo.

### Migration 0056 (schema `payments`)

```sql
create table if not exists payments.payment_provider_settings (
  tenant_id   uuid primary key,
  provider_code text not null default 'noop',
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);
```

Plus permission `payments.configure` (admin/менеджер) seeded to `platform_admin` + `tenant_admin`
(mirror `webinars.configure` in 0055). Latest migration on `main` is **0055** → this is **0056**.

## Real adapters (`infrastructure/payments/`)

All four implement `PaymentProvider`; credentials come from env (one platform merchant). Outbound HTTP
uses the native `fetch` global (project convention — see `realtime-events.service.ts`), injected for
testability (`constructor(..., fetchImpl: typeof fetch = globalThis.fetch)`). Kopeck↔major-unit
conversion happens **only** at the adapter boundary; the domain stays integer kopecks.

### 1. `yookassa-payment.provider.ts` (`code='yookassa'`)

- **createPayment:** `POST {apiBase}/payments`, headers `Authorization: Basic base64(shopId:secretKey)`,
  `Idempotence-Key: <orderId>`, `Content-Type: application/json`. Body
  `{ amount: { value: "1500.00", currency }, capture: true, confirmation: { type: 'redirect', return_url },
description, metadata: { orderId, tenantId } }`. Returns
  `{ providerPaymentId: resp.id, status: 'pending', confirmationUrl: resp.confirmation.confirmation_url }`.
  Non-2xx → throw (service surfaces a 502; no phantom payment row).
- **parseWebhook (re-fetch + IP-allowlist):**
  1. Parse JSON; require `type='notification'`, `event ∈ {payment.succeeded, payment.canceled,
refund.succeeded}`, `object.id` present → else `null`.
  2. **IP-allowlist (defense-in-depth):** extract client IP from `x-forwarded-for` (behind Caddy). If
     checking enabled AND IP determinable AND not in the configured ЮKassa ranges → `null` (cheap spam
     drop before the API call). IP indeterminable → fall through (fail-open; re-fetch is the real gate).
  3. **Re-fetch (source of truth):** `GET {apiBase}/payments/{object.id}` with Basic auth; trust the
     **fetched** status, not the notification body (a spoofed body cannot fake our authenticated call).
  4. Map `succeeded→'succeeded'`, `canceled→'cancelled'`, anything non-terminal (`waiting_for_capture`,
     `pending`) → `null`. `refund.succeeded` → `null` (refund flow deferred).
- **webhookAck:** omitted (200 + `{ ok: true }` default is fine for ЮKassa).

### 2. `tinkoff-payment.provider.ts` (`code='tinkoff'`, Т-Касса)

- **Auth model:** token signature — SHA-256 of the request params (excluding `Token`/nested objects),
  sorted by key, concatenated with `Password`, lowercased hex.
- **createPayment:** `POST {apiBase}/v2/Init` with `{ TerminalKey, Amount: <kopecks>, OrderId: orderId,
Description, NotificationURL, SuccessURL, Token }` (Amount is **kopecks integer** — Tinkoff's native
  unit, no conversion). Returns `{ providerPaymentId: resp.PaymentId, status: 'pending',
confirmationUrl: resp.PaymentURL }`. `resp.Success === false` → throw.
- **parseWebhook:** Tinkoff POSTs a token-signed JSON notification. Recompute the token from the body and
  compare to `body.Token` → mismatch → `null` (cryptographic verification in-process, no re-fetch needed).
  Map `Status: 'CONFIRMED'|'AUTHORIZED' → 'succeeded'`, `'REJECTED'|'CANCELED' → 'cancelled'`, else `null`.
  `providerPaymentId = body.PaymentId`.
- **webhookAck:** returns the literal string `"OK"` (Tinkoff requirement).

### 3. `cloudpayments-payment.provider.ts` (`code='cloudpayments'`)

- **Auth model:** `Authorization: Basic base64(publicId:apiSecret)` for API calls; webhook authenticity
  via **HMAC-SHA256** of the raw body with the apiSecret, compared to the `Content-HMAC` header.
- **createPayment:** `POST {apiBase}/orders/create` with `{ Amount: <major-units number>, Currency,
Description, JsonData: { orderId, tenantId } }`. Returns `{ providerPaymentId: resp.Model.Id,
status: 'pending', confirmationUrl: resp.Model.Url }`. `resp.Success === false` → throw.
- **parseWebhook:** verify `Content-HMAC` header == base64(HMAC-SHA256(rawBody, apiSecret)); mismatch →
  `null`. Map `Status`/`Pay` notification → `'succeeded'`; `Fail`/`Cancel` → `'cancelled'`/`'failed'`.
  `providerPaymentId` from the notification's `TransactionId`/`InvoiceId`.
- **webhookAck:** returns `{ code: 0 }` (CloudPayments "accepted" code).

### 4. `robokassa-payment.provider.ts` (`code='robokassa'`)

- **Auth model:** MD5 signatures. createPayment needs **no HTTP call** — it builds a signed redirect URL.
- **createPayment:** compute `SignatureValue = md5(MerchantLogin:OutSum:InvId:Password1)`; build
  `confirmationUrl = {payUrl}?MerchantLogin=…&OutSum=<rubles>&InvId=<numericId>&Description=…&
SignatureValue=…`. `OutSum` is rubles with 2 decimals (kopeck conversion at boundary). `InvId` is a
  numeric invoice id derived from the order (Robokassa requires integer InvId — see Resolved details).
  Returns `{ providerPaymentId: String(invId), status: 'pending', confirmationUrl }`.
- **parseWebhook (ResultURL):** verify `md5(OutSum:InvId:Password2)` == `SignatureValue` (case-insensitive)
  → mismatch → `null`. A valid ResultURL hit means payment succeeded → `'succeeded'`,
  `providerPaymentId = InvId`.
- **webhookAck:** returns the literal string `` `OK${invId}` `` (Robokassa requirement to stop retries).

## Call-site refactor (single token → resolver / registry)

- **`PaymentsService.pay()`** (authed, tenantId present): inject `PaymentProviderResolver` instead of
  `@Inject(PAYMENT_PROVIDER)`; `const provider = await this.resolver.forTenant(tenantId)`; use
  `provider.createPayment(...)` and `provider.code` (stored in `payments.provider`).
- **Webhook controller** → **provider-specific path** `POST /payments/webhook/:providerCode`
  (replaces `POST /payments/webhook`). Unguarded (acquirer carries no JWT/x-tenant-id). Flow:
  1. `registry.get(providerCode)` (creds are global → the registry instance is correct without a tenant).
     Apply the prod-guard: `providerCode==='fake' && NODE_ENV==='production'` → 200 no-op.
  2. `event = await provider.parseWebhook(raw, headers)`; `null` → ACK no-op.
  3. Resolve the order by `provider_payment_id → tenant_id` (existing repo method); not found → ACK no-op.
  4. On `succeeded`: idempotent `payment.status='succeeded'` + `order.status='paid'` + fulfillment
     (existing `PaymentFulfillmentService`, unchanged). Else update payment status.
  5. Respond with `provider.webhookAck?.(event, raw) ?? { ok: true }`.

Cross-tenant isolation holds: a webhook can only touch the single order whose `provider_payment_id` it
carries; authenticity is the adapter's signature/re-fetch check.

## env (`env.schema.ts`)

- **Keep** master switch `PAYMENTS_ENABLED` (custom boolean parse) and `PAYMENTS_CURRENCY='RUB'`.
- **Remove** `PAYMENTS_PROVIDER` enum and its `fake`-in-prod refinement (selection is per-tenant; the
  prod-guard moved to the resolver) — mirrors webinars having no `WEBINARS_PROVIDER`.
- **Add**, all optional while dormant:
  - ЮKassa: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL`,
    `YOOKASSA_API_BASE` (default `https://api.yookassa.ru/v3`),
    `YOOKASSA_WEBHOOK_IPS` (default published ranges), `YOOKASSA_WEBHOOK_IP_CHECK` (default `true`).
  - Tinkoff: `TINKOFF_TERMINAL_KEY`, `TINKOFF_PASSWORD`, `TINKOFF_API_BASE`
    (default `https://securepay.tinkoff.ru`), `TINKOFF_SUCCESS_URL`.
  - CloudPayments: `CLOUDPAYMENTS_PUBLIC_ID`, `CLOUDPAYMENTS_API_SECRET`,
    `CLOUDPAYMENTS_API_BASE` (default `https://api.cloudpayments.ru`).
  - Robokassa: `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD_1`, `ROBOKASSA_PASSWORD_2`,
    `ROBOKASSA_PAY_URL` (default `https://auth.robokassa.ru/Merchant/Index.aspx`).
- **Refinement:** when `PAYMENTS_ENABLED=true`, **each provider's credentials are required only if that
  provider is actually buildable** — i.e. the registry factory skips an adapter whose creds are blank and
  logs a warning, rather than failing boot. Rationale: an operator enabling payments with only ЮKassa
  creds must not be forced to also fill Tinkoff/CloudPayments/Robokassa. A tenant selecting a provider
  with no creds resolves to Noop (resolver already falls back). `env.payments.test.ts` updated accordingly.
- **`infra/.env.production.example` + deploy guard:** the deploy-readiness guard (§5.136) parses the
  example against the real boot schema. Update the example to drop `PAYMENTS_PROVIDER` and add the new
  acquirer vars as commented placeholders (dormant defaults must still parse: `PAYMENTS_ENABLED=false`,
  blank creds). Re-run that guard test after the env change.

## main.ts

`NestFactory.create(AppModule, { rawBody: true, cors: {...} })`. The webhook controller already reads
`req.rawBody`; this is required for HMAC/MD5/token verification over the exact bytes received.

## Registry wiring (`payments.module.ts`)

Replace the single `PAYMENT_PROVIDER` factory with:

```ts
{ provide: PAYMENT_PROVIDER_REGISTRY, useFactory: (): PaymentProviderRegistry => {
    const m = new Map<PaymentProviderCode, PaymentProvider>([
      ['noop', new NoopPaymentProvider()],
      ['fake', new FakePaymentProvider()],
    ]);
    // each real adapter added only if its creds are present (else logged + skipped)
    if (yookassaConfigured) m.set('yookassa', new YookassaPaymentProvider(...envCfg));
    if (tinkoffConfigured) m.set('tinkoff', new TinkoffPaymentProvider(...envCfg));
    if (cloudpaymentsConfigured) m.set('cloudpayments', new CloudPaymentsPaymentProvider(...envCfg));
    if (robokassaConfigured) m.set('robokassa', new RobokassaPaymentProvider(...envCfg));
    return m;
}},
PaymentProviderResolver,
{ provide: PAYMENT_PROVIDER_SETTINGS_REPOSITORY, useFactory: (db) => ... },
PaymentProviderSettingsService,
```

## Frontend (`apps/frontend/src/features/payments/`)

- New page **`/admin/payments/settings`** — pick provider (dropdown of registry codes) + enabled toggle,
  saved via `PUT /admin/payments/settings` (under `payments.configure`). Mirror of
  `/admin/webinars/settings`. Mutations use `useState`+async (`useDomainMutations.wrap`, not React Query).
- Navigation entry in `features/navigation/model.ts` (`routeMeta` + `navigationModel`) under
  `payments.configure`. **Ordering caution (Phase 8 lesson):** a more-specific `/admin/payments/settings`
  route must be declared so it does not inherit a broader `/admin/payments` policy — add a regression
  assertion for route ordering.
- Existing `/admin/orders` and `/learner/payments` are unchanged in substance; the learner "Оплатить"
  button now produces a real `confirmationUrl` when the tenant has an active provider.

## Testing (TDD)

- **Per adapter** `*-payment.provider.test.ts` (mocked `fetch`): createPayment (request shape, auth
  header/signature, kopeck conversion, non-2xx → throw), parseWebhook (valid success, cancel, bad
  signature/HMAC/MD5 → null, unknown event → null, ЮKassa spoofed body but API says pending → null,
  ЮKassa IP outside allowlist → null), webhookAck format.
- **`payment-provider-resolver.service.test.ts`** — per-tenant selection, master-switch off → Noop,
  `fake` in production → Noop, unknown code → Noop.
- **`payment-provider-settings.{service,repository}.test.ts`** — default view, upsert round-trip.
- **`payments.http.integration.test.ts`** (extend) — `payments.configure` boundary on settings
  endpoints; provider-specific webhook path resolves the order by `provider_payment_id`; unknown
  `providerCode` → 200 no-op.
- **`env.payments.test.ts`** — new credential/refinement behaviour; removal of `PAYMENTS_PROVIDER`.
- **migration 0056 test** — `payment_provider_settings` exists, `payments.configure` seeded.
- **Frontend** — `api.contract.test.ts` (settings envelope unwrap) + e2e permission/routing for
  `/admin/payments/settings` (no `render()`), including the route-ordering regression.

## Scope boundaries (YAGNI — separate specs)

- ❌ **Per-tenant own merchant accounts** (encrypted per-tenant credentials + key-entry UI).
- ❌ **Чек 54-ФЗ / ОФД** (online fiscal receipt).
- ❌ **Счёт/акт PDF** for B2B (via documents pipeline).
- ❌ **Checkout landing** (B2C marketing).
- ❌ **Refunds** (`refunded` reserved; `refund.*` notifications parse to `null` no-op).
- ❌ Additional acquirers beyond the four (SberPay, Точка, etc.) — register a strategy when needed.

## Deliverable summary

Payment seam refactored to **registry + per-tenant resolver** (mirror of Phase 8 webinars); **four real
acquirer adapters** (ЮKassa, Т-Касса, CloudPayments, Robokassa) behind it, credentials from env (one
platform merchant); provider-specific webhook path with per-provider ACK; `rawBody` enabled;
per-tenant settings table + `/admin/payments/settings` UI; migration **0056** + permission
`payments.configure`. Online payment is **code-complete** — go-live needs only an acquirer contract +
live credentials + `PAYMENTS_ENABLED=true` + a tenant selecting a provider.

## Resolved details (snap to avoid plan-time ambiguity)

- **`provider.id` → `provider.code` rename:** ripples to Noop/Fake, `PaymentsService.pay` (stores
  `provider.code` in the `payments.provider` column), and existing tests. Accepted for parity with
  `WebinarProvider.code`.
- **Robokassa numeric `InvId`:** Robokassa requires an integer invoice id, but our `order.id` is a UUID.
  The adapter derives a stable positive 31-bit integer from the order id (e.g. a hash) and stores it as
  `providerPaymentId`; the webhook resolves the order by this same `provider_payment_id`. Documented as a
  deviation if a cleaner scheme emerges during implementation.
- **CloudPayments amount unit:** CloudPayments `Amount` is a **major-unit number** (rubles), not kopecks;
  convert at the boundary like ЮKassa/Robokassa. Tinkoff `Amount` is **kopecks** (no conversion).
- **Webhook ACK default:** providers without `webhookAck` get `{ ok: true }` (current behaviour).
- **Credential-gated registry:** an adapter with blank creds is **omitted from the registry** (logged),
  so enabling payments with only one acquirer configured does not break boot or other tenants.
- **`PAYMENTS_CURRENCY`:** stays `RUB`-only this iteration (all four adapters assume RUB).

```

```
