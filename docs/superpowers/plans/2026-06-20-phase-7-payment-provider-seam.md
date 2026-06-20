# Phase 7 — Payment Provider Seam (Dormant Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-agnostic dormant payment seam — durable order/payment domain (migration 0054) + `PaymentProvider` seam (Noop default, Fake for staging, ЮKassa later) + working manual bank-transfer mark-paid + idempotent fail-soft fulfillment into existing enrollment — without moving real money.

**Architecture:** New isolated NestJS module `payments/` mirroring `esign`. Durable Postgres (schema `payments`, 3 tables) via a dual-backend repository (in-memory + postgres) mirroring `recertification-drafts`. Provider seam in `infrastructure/payments/` mirroring `infrastructure/export-signature/`. Successful payment (online OR manual) → `paid` → `PaymentFulfillmentService` calls existing `MvpService.createBulkEnrollments` → `fulfilled`. Webhook is a separate unguarded controller (mirror `PublicVerifyController`), tenant resolved from the stored payment row.

**Tech Stack:** NestJS, TypeScript (ESM, `.js` import suffixes), Zod env, `class-validator` DTOs, Vitest, PostgreSQL, Next.js 15 (frontend).

**Spec:** [docs/superpowers/specs/2026-06-20-phase-7-payment-provider-seam-design.md](../specs/2026-06-20-phase-7-payment-provider-seam-design.md)

> **STATUS (2026-06-20): IMPLEMENTED ✅** — all 15 tasks done (subagent-driven) + 2 fixes (ownership-guard on `pay`;
> CRITICAL fulfillment-state via `MvpEnrollmentService`/`MvpTenantRunner`) + final holistic opus-review. Backend payments
> 46 tests / frontend 16 / typecheck 8/8 / ESLint clean / migrations to 0054. Deviation: `course_version_id`→`group_id`
> (real enrollment primitive). See handoff §5.133. Awaiting PR.

**Conventions reminder:**

- Run a single backend test file: `pnpm --filter @cdoprof/backend exec vitest run <path> --no-file-parallelism`
- All money is **integer kopecks**. Never float.
- ESM: every relative import ends in `.js`.
- Commit after each task (Conventional Commits, `feat(backend):` / `feat(frontend):` scope).

---

## Task 1: Provider seam interface + Noop default

**Files:**

- Create: `apps/backend/src/infrastructure/payments/payment.provider.ts`
- Test: `apps/backend/src/infrastructure/payments/noop-payment.provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// noop-payment.provider.test.ts
import { describe, expect, it } from 'vitest';
import { NoopPaymentProvider } from './payment.provider.js';

describe('NoopPaymentProvider', () => {
  it('reports disabled and never produces a confirmation url', async () => {
    const provider = new NoopPaymentProvider();
    const result = await provider.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс ОТ'
    });
    expect(provider.id).toBe('noop');
    expect(result.status).toBe('disabled');
    expect(result.confirmationUrl).toBeUndefined();
  });

  it('parses no webhook event (no-op)', async () => {
    const provider = new NoopPaymentProvider();
    const event = await provider.parseWebhook(Buffer.from('{}'), {});
    expect(event).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/noop-payment.provider.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./payment.provider.js`.

- [ ] **Step 3: Write the seam**

```ts
// payment.provider.ts
/**
 * Provider-agnostic seam for course-purchase payments, mirroring ExportSignatureProvider.
 * Noop is the safe default for dev/test and any env with PAYMENTS_ENABLED=false: online
 * payment is unavailable, but manual bank-transfer mark-paid still works. A ЮKassa adapter
 * plugs in later behind PAYMENT_PROVIDER. All amounts are integer kopecks.
 */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';

export interface CreatePaymentParams {
  tenantId: string;
  orderId: string;
  /** Integer kopecks. */
  amount: number;
  currency: string;
  description: string;
}

export interface CreatePaymentResult {
  /** Provider-side payment id; '' when disabled. */
  providerPaymentId: string;
  status: 'pending' | 'disabled';
  /** Redirect URL the buyer opens to pay. Set only when a real/fake provider is active. */
  confirmationUrl?: string;
}

export interface WebhookEvent {
  providerPaymentId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  /** Stable provider id ('noop' | 'fake' | 'yookassa'). */
  readonly id: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  /** Verifies signature internally; returns null for unrecognized/unsigned payloads. */
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null>;
}

/** DI token for the active payment provider. Mirrors EXPORT_SIGNATURE_PROVIDER. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export class NoopPaymentProvider implements PaymentProvider {
  readonly id = 'noop';
  async createPayment(_params: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { providerPaymentId: '', status: 'disabled' };
  }
  async parseWebhook(): Promise<WebhookEvent | null> {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/noop-payment.provider.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/payments/
git commit -m "feat(backend): payment provider seam interface + Noop provider"
```

---

## Task 2: Fake (staging) payment provider

**Files:**

- Create: `apps/backend/src/infrastructure/payments/fake-payment.provider.ts`
- Test: `apps/backend/src/infrastructure/payments/fake-payment.provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// fake-payment.provider.test.ts
import { describe, expect, it } from 'vitest';
import { FakePaymentProvider } from './fake-payment.provider.js';

describe('FakePaymentProvider', () => {
  it('returns a synthetic confirmation url + pending status', async () => {
    const provider = new FakePaymentProvider();
    const result = await provider.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс ОТ'
    });
    expect(provider.id).toBe('fake');
    expect(result.status).toBe('pending');
    expect(result.providerPaymentId).toMatch(/^fake-pay:/);
    expect(result.confirmationUrl).toContain('o1');
  });

  it('parses a fake webhook into a succeeded event', async () => {
    const provider = new FakePaymentProvider();
    const raw = Buffer.from(
      JSON.stringify({ providerPaymentId: 'fake-pay:o1', status: 'succeeded' })
    );
    const event = await provider.parseWebhook(raw, {});
    expect(event).toEqual({
      providerPaymentId: 'fake-pay:o1',
      status: 'succeeded',
      rawPayload: { providerPaymentId: 'fake-pay:o1', status: 'succeeded' }
    });
  });

  it('returns null for an unparseable webhook body', async () => {
    const provider = new FakePaymentProvider();
    const event = await provider.parseWebhook(Buffer.from('not-json'), {});
    expect(event).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/fake-payment.provider.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the fake provider**

```ts
// fake-payment.provider.ts
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

/**
 * STAGING-ONLY payment provider. Produces a synthetic confirmation URL and accepts a synthetic
 * webhook WITHOUT any real acquiring, so dev/staging can exercise order → pay → webhook →
 * fulfillment end-to-end. FORBIDDEN in production by an env refinement (see env.schema.ts):
 * prod must never believe an order is paid when no money moved. The real ЮKassa adapter
 * replaces this behind the same PAYMENT_PROVIDER token.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly id = 'fake';

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const providerPaymentId = `fake-pay:${params.orderId}`;
    return {
      providerPaymentId,
      status: 'pending',
      confirmationUrl: `https://staging.fake-pay.local/confirm?order=${params.orderId}`
    };
  }

  async parseWebhook(raw: Buffer): Promise<WebhookEvent | null> {
    try {
      const body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      const providerPaymentId = body.providerPaymentId;
      const status = body.status;
      if (
        typeof providerPaymentId !== 'string' ||
        (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled')
      ) {
        return null;
      }
      return { providerPaymentId, status, rawPayload: body };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/fake-payment.provider.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/payments/
git commit -m "feat(backend): fake (staging) payment provider"
```

---

## Task 3: Env flags + prod-guard refinement

**Files:**

- Modify: `apps/backend/src/env.schema.ts` (add `PAYMENTS_*` fields after the `EXPORT_SIGN_*` block ~line 66; add a prod-guard refinement near the existing `EXPORT_SIGN_PROVIDER` refinement ~line 384)
- Test: `apps/backend/src/env.payments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// env.payments.test.ts
import { describe, expect, it } from 'vitest';
import { backendEnvSchema } from './env.schema.js';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  ESIA_STATE_SECRET: 'y'.repeat(32)
};

describe('payments env', () => {
  it('defaults to dormant noop', () => {
    const env = backendEnvSchema.parse({ ...base });
    expect(env.PAYMENTS_ENABLED).toBe(false);
    expect(env.PAYMENTS_PROVIDER).toBe('noop');
    expect(env.PAYMENTS_CURRENCY).toBe('RUB');
  });

  it('string "false" stays false (custom boolean parse)', () => {
    const env = backendEnvSchema.parse({ ...base, PAYMENTS_ENABLED: 'false' });
    expect(env.PAYMENTS_ENABLED).toBe(false);
  });

  it('forbids PAYMENTS_PROVIDER=fake in production', () => {
    expect(() =>
      backendEnvSchema.parse({ ...base, NODE_ENV: 'production', PAYMENTS_PROVIDER: 'fake' })
    ).toThrow(/fake is forbidden in production/);
  });

  it('allows PAYMENTS_PROVIDER=fake outside production', () => {
    const env = backendEnvSchema.parse({ ...base, NODE_ENV: 'staging', PAYMENTS_PROVIDER: 'fake' });
    expect(env.PAYMENTS_PROVIDER).toBe('fake');
  });
});
```

> NOTE: copy the exact `base` required-field set from the existing `env.export-sign.test.ts` if these differ — the goal is a schema-valid baseline so only the payments fields are under test.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.payments.test.ts --no-file-parallelism`
Expected: FAIL — `PAYMENTS_ENABLED` undefined.

- [ ] **Step 3: Add env fields**

In `env.schema.ts`, after the `EXPORT_SIGN_SIGNER_NAME` field (~line 66), add:

```ts
    // Payments seam (Phase 7). Ships dormant (false) → NoopPaymentProvider: online payment is
    // unavailable, manual bank-transfer mark-paid still works. Custom boolean parse — NOT
    // z.coerce.boolean (string "false" → true) — so a money flag is never accidentally on.
    PAYMENTS_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active payment provider. 'noop' until a ЮKassa adapter is wired. 'fake' = staging preview. */
    PAYMENTS_PROVIDER: z.enum(['noop', 'yookassa', 'fake']).default('noop'),
    /** ISO-4217 currency. RUB-only this iteration. */
    PAYMENTS_CURRENCY: z.literal('RUB').default('RUB'),
```

In the `.superRefine(...)` block, after the `EXPORT_SIGN_PROVIDER === 'fake'` refinement (~line 384), add:

```ts
if (env.PAYMENTS_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['PAYMENTS_PROVIDER'],
    message: 'PAYMENTS_PROVIDER=fake is forbidden in production — it fakes payments (use yookassa)'
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.payments.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/env.schema.ts apps/backend/src/env.payments.test.ts
git commit -m "feat(backend): PAYMENTS_* env flags + fake prod-guard"
```

---

## Task 4: Migration 0054 — schema `payments`, 3 tables, permissions

**Files:**

- Create: `apps/backend/migrations/0054_payments_orders_foundation.sql`
- Test: add a case to the migrations test suite (find it: `apps/backend/src/**/migrations*.test.ts`; mirror how 0053 is asserted — typically a "file exists + parses + idempotent" check). If the suite enumerates migrations automatically, no test edit is needed; verify by running it.

- [ ] **Step 1: Write the migration**

```sql
-- 0054_payments_orders_foundation.sql
-- Phase 7 — payment provider seam (dormant foundation).
-- Durable order/payment domain. All amounts are integer kopecks. buyer_id is a soft reference
-- (no FK to the crm stub). Permissions payments.read / payments.write / payments.self_purchase.

create schema if not exists payments;

create table if not exists payments.orders (
  id text primary key,
  tenant_id text not null,
  buyer_type text not null check (buyer_type in ('learner', 'counterparty')),
  buyer_id text not null,
  status text not null default 'awaiting_payment'
    check (status in ('draft', 'awaiting_payment', 'paid', 'fulfilled', 'cancelled')),
  currency text not null default 'RUB',
  total_amount bigint not null check (total_amount >= 0),
  description text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_orders_tenant_status
  on payments.orders (tenant_id, status);
create index if not exists idx_payments_orders_tenant_buyer
  on payments.orders (tenant_id, buyer_type, buyer_id);

create table if not exists payments.order_items (
  id text primary key,
  tenant_id text not null,
  order_id text not null references payments.orders (id) on delete cascade,
  course_version_id text not null,
  learner_id text not null,
  unit_amount bigint not null check (unit_amount >= 0),
  fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending', 'enrolled', 'skipped')),
  enrollment_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_order_items_order
  on payments.order_items (order_id);

create table if not exists payments.payments (
  id text primary key,
  tenant_id text not null,
  order_id text not null references payments.orders (id) on delete cascade,
  provider text not null check (provider in ('manual', 'noop', 'fake', 'yookassa')),
  provider_payment_id text null,
  method text not null check (method in ('manual', 'bank_transfer', 'card')),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'cancelled', 'refunded')),
  amount bigint not null check (amount >= 0),
  confirmation_url text null,
  paid_at timestamptz null,
  idempotency_key text null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- provider_payment_id is how the unguarded webhook resolves order+tenant → must be unique when present.
create unique index if not exists uq_payments_provider_payment_id
  on payments.payments (provider_payment_id)
  where provider_payment_id is not null;
create index if not exists idx_payments_payments_order
  on payments.payments (order_id);

insert into iam.permissions (id, code, description)
values
  ('p_payments_read', 'payments.read', 'Read orders and payments'),
  ('p_payments_write', 'payments.write', 'Create/cancel orders, mark paid (manual)'),
  ('p_payments_self_purchase', 'payments.self_purchase', 'Learner creates/pays/views own order')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and (
    (r.code in ('platform_admin', 'tenant_admin') and p.code in ('payments.read', 'payments.write'))
    or (r.code = 'learner' and p.code = 'payments.self_purchase')
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
```

> Verify role codes exist: `platform_admin`, `tenant_admin`, `learner` are seeded (see `0038_iam_learner_role_and_seed.sql`). If `methodist`/manager should also read payments, add `or (r.code = 'methodist' and p.code = 'payments.read')`.

- [ ] **Step 2: Run the migrations test to verify it passes (idempotent + parses)**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/**/migrations*.test.ts --no-file-parallelism` (adjust path to the actual migrations test file; e.g. `pnpm test:migrations`)
Expected: PASS — 0054 enumerated, no checksum/ordering errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/migrations/0054_payments_orders_foundation.sql
git commit -m "feat(backend): migration 0054 — payments schema + orders/items/payments + permissions"
```

---

## Task 5: Domain types + DTOs

**Files:**

- Create: `apps/backend/src/modules/payments/payments.types.ts`
- Create: `apps/backend/src/modules/payments/payments.dto.ts`
- Test: `apps/backend/src/modules/payments/payments.dto-validation.test.ts`

- [ ] **Step 1: Write the types** (no test — pure type declarations)

```ts
// payments.types.ts
export type OrderStatus = 'draft' | 'awaiting_payment' | 'paid' | 'fulfilled' | 'cancelled';
export type OrderBuyerType = 'learner' | 'counterparty';
export type ItemFulfillmentStatus = 'pending' | 'enrolled' | 'skipped';
export type PaymentRowStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
export type PaymentProviderId = 'manual' | 'noop' | 'fake' | 'yookassa';
export type PaymentMethod = 'manual' | 'bank_transfer' | 'card';

export interface OrderItemEntity {
  id: string;
  tenantId: string;
  orderId: string;
  courseVersionId: string;
  learnerId: string;
  unitAmount: number; // kopecks
  fulfillmentStatus: ItemFulfillmentStatus;
  enrollmentId?: string;
}

export interface OrderEntity {
  id: string;
  tenantId: string;
  buyerType: OrderBuyerType;
  buyerId: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number; // kopecks
  description?: string;
  items: OrderItemEntity[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEntity {
  id: string;
  tenantId: string;
  orderId: string;
  provider: PaymentProviderId;
  providerPaymentId?: string;
  method: PaymentMethod;
  status: PaymentRowStatus;
  amount: number; // kopecks
  confirmationUrl?: string;
  paidAt?: string;
  idempotencyKey?: string;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Write the failing DTO-validation test**

```ts
// payments.dto-validation.test.ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateOrderRequest, MarkPaidRequest } from './payments.dto.js';

const errCount = (cls: any, raw: unknown) =>
  validateSync(plainToInstance(cls, raw), { whitelist: true }).length;

describe('CreateOrderRequest', () => {
  it('accepts a valid one-item order', () => {
    expect(
      errCount(CreateOrderRequest, {
        buyerType: 'learner',
        buyerId: 'l1',
        description: 'Курс ОТ',
        items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 150000 }]
      })
    ).toBe(0);
  });

  it('rejects an empty items array', () => {
    expect(
      errCount(CreateOrderRequest, { buyerType: 'learner', buyerId: 'l1', items: [] })
    ).toBeGreaterThan(0);
  });

  it('rejects a non-integer / negative unitAmount', () => {
    expect(
      errCount(CreateOrderRequest, {
        buyerType: 'learner',
        buyerId: 'l1',
        items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: -5 }]
      })
    ).toBeGreaterThan(0);
    expect(
      errCount(CreateOrderRequest, {
        buyerType: 'learner',
        buyerId: 'l1',
        items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 1.5 }]
      })
    ).toBeGreaterThan(0);
  });

  it('rejects an invalid buyerType', () => {
    expect(
      errCount(CreateOrderRequest, {
        buyerType: 'alien',
        buyerId: 'l1',
        items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 }]
      })
    ).toBeGreaterThan(0);
  });
});

describe('MarkPaidRequest', () => {
  it('accepts bank_transfer method', () => {
    expect(errCount(MarkPaidRequest, { method: 'bank_transfer' })).toBe(0);
  });
  it('rejects an unknown method', () => {
    expect(errCount(MarkPaidRequest, { method: 'crypto' })).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payments.dto-validation.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./payments.dto.js`.

- [ ] **Step 4: Write the DTOs**

```ts
// payments.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';

export class CreateOrderItemRequest {
  @IsString()
  @MinLength(1)
  courseVersionId!: string;

  @IsString()
  @MinLength(1)
  learnerId!: string;

  @IsInt()
  @Min(0)
  unitAmount!: number; // kopecks
}

export class CreateOrderRequest {
  @IsIn(['learner', 'counterparty'])
  buyerType!: 'learner' | 'counterparty';

  @IsString()
  @MinLength(1)
  buyerId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemRequest)
  items!: CreateOrderItemRequest[];
}

/** Learner self-order: buyer is the session learner, so no buyerType/buyerId in the body. */
export class CreateSelfOrderRequest {
  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemRequest)
  items!: CreateOrderItemRequest[];
}

export class MarkPaidRequest {
  @IsOptional()
  @IsIn(['manual', 'bank_transfer'])
  method?: 'manual' | 'bank_transfer';

  @IsOptional()
  @IsString()
  note?: string;
}

export class OrdersFilter {
  @IsOptional()
  @IsIn(['draft', 'awaiting_payment', 'paid', 'fulfilled', 'cancelled'])
  status?: string;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payments.dto-validation.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/payments/payments.types.ts apps/backend/src/modules/payments/payments.dto.ts apps/backend/src/modules/payments/payments.dto-validation.test.ts
git commit -m "feat(backend): payments domain types + request DTOs"
```

---

## Task 6: State machine (pure transition functions)

**Files:**

- Create: `apps/backend/src/modules/payments/payments.state-machine.ts`
- Test: `apps/backend/src/modules/payments/payments.state-machine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// payments.state-machine.test.ts
import { describe, expect, it } from 'vitest';
import { assertOrderTransition, canCancelOrder } from './payments.state-machine.js';

describe('order state machine', () => {
  it('allows awaiting_payment → paid → fulfilled', () => {
    expect(() => assertOrderTransition('awaiting_payment', 'paid')).not.toThrow();
    expect(() => assertOrderTransition('paid', 'fulfilled')).not.toThrow();
  });

  it('forbids fulfilled → paid (no backward)', () => {
    expect(() => assertOrderTransition('fulfilled', 'paid')).toThrow(/invalid_order_transition/);
  });

  it('forbids paying a cancelled order', () => {
    expect(() => assertOrderTransition('cancelled', 'paid')).toThrow(/invalid_order_transition/);
  });

  it('allows cancel only from draft/awaiting_payment', () => {
    expect(canCancelOrder('draft')).toBe(true);
    expect(canCancelOrder('awaiting_payment')).toBe(true);
    expect(canCancelOrder('paid')).toBe(false);
    expect(canCancelOrder('fulfilled')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payments.state-machine.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the state machine**

```ts
// payments.state-machine.ts
import type { OrderStatus } from './payments.types.js';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['fulfilled'],
  fulfilled: [],
  cancelled: []
};

export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`invalid_order_transition: ${from} → ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export function canCancelOrder(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].includes('cancelled');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payments.state-machine.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments/payments.state-machine.ts apps/backend/src/modules/payments/payments.state-machine.test.ts
git commit -m "feat(backend): payments order state machine"
```

---

## Task 7: Repository interface + in-memory implementation

**Files:**

- Create: `apps/backend/src/modules/payments/payments.repository.ts` (interface + token + seed types)
- Create: `apps/backend/src/modules/payments/in-memory-payments.repository.ts`
- Test: `apps/backend/src/modules/payments/in-memory-payments.repository.test.ts`

Mirror `recertification-drafts.repository.ts` (interface) + `in-memory-recertification-drafts.state.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// in-memory-payments.repository.test.ts
import { describe, expect, it } from 'vitest';
import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';

const seed = {
  tenantId: 't1',
  buyerType: 'learner' as const,
  buyerId: 'l1',
  currency: 'RUB',
  description: 'Курс ОТ',
  createdBy: 'admin',
  items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 150000 }]
};

describe('InMemoryPaymentsRepository', () => {
  it('creates an order with computed total + awaiting_payment status', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    expect(order.status).toBe('awaiting_payment');
    expect(order.totalAmount).toBe(150000);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.fulfillmentStatus).toBe('pending');
  });

  it('reads back by id within tenant, isolates across tenants', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    expect(await repo.getOrder('t1', order.id)).not.toBeNull();
    expect(await repo.getOrder('t2', order.id)).toBeNull();
  });

  it('records a payment and finds the order by provider_payment_id', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    await repo.createPayment({
      tenantId: 't1',
      orderId: order.id,
      provider: 'fake',
      providerPaymentId: 'fake-pay:x',
      method: 'card',
      amount: 150000,
      status: 'pending'
    });
    const found = await repo.findOrderByProviderPaymentId('fake-pay:x');
    expect(found?.order.id).toBe(order.id);
    expect(found?.tenantId).toBe('t1');
  });

  it('updates order status', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await repo.createOrder(seed);
    await repo.updateOrderStatus('t1', order.id, 'paid');
    expect((await repo.getOrder('t1', order.id))!.status).toBe('paid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/in-memory-payments.repository.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the interface**

```ts
// payments.repository.ts
import type {
  ItemFulfillmentStatus,
  OrderEntity,
  OrderStatus,
  PaymentEntity,
  PaymentMethod,
  PaymentProviderId,
  PaymentRowStatus
} from './payments.types.js';

export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');

export interface CreateOrderSeed {
  tenantId: string;
  buyerType: 'learner' | 'counterparty';
  buyerId: string;
  currency: string;
  description?: string;
  createdBy?: string;
  items: { courseVersionId: string; learnerId: string; unitAmount: number }[];
}

export interface CreatePaymentSeed {
  tenantId: string;
  orderId: string;
  provider: PaymentProviderId;
  providerPaymentId?: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentRowStatus;
  confirmationUrl?: string;
  idempotencyKey?: string;
  rawPayload?: Record<string, unknown>;
}

export interface PaymentsRepository {
  createOrder(seed: CreateOrderSeed): Promise<OrderEntity>;
  getOrder(tenantId: string, orderId: string): Promise<OrderEntity | null>;
  listOrders(
    tenantId: string,
    filter: { status?: string; buyerId?: string }
  ): Promise<OrderEntity[]>;
  updateOrderStatus(tenantId: string, orderId: string, status: OrderStatus): Promise<void>;
  createPayment(seed: CreatePaymentSeed): Promise<PaymentEntity>;
  updatePaymentStatus(
    tenantId: string,
    paymentId: string,
    status: PaymentRowStatus,
    paidAt?: string
  ): Promise<void>;
  findOrderByProviderPaymentId(
    providerPaymentId: string
  ): Promise<{ tenantId: string; order: OrderEntity; payment: PaymentEntity } | null>;
  markItemFulfilled(
    tenantId: string,
    itemId: string,
    status: ItemFulfillmentStatus,
    enrollmentId?: string
  ): Promise<void>;
}
```

- [ ] **Step 4: Write the in-memory implementation**

```ts
// in-memory-payments.repository.ts
import type {
  CreateOrderSeed,
  CreatePaymentSeed,
  PaymentsRepository
} from './payments.repository.js';
import type {
  ItemFulfillmentStatus,
  OrderEntity,
  OrderItemEntity,
  OrderStatus,
  PaymentEntity,
  PaymentRowStatus
} from './payments.types.js';

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class InMemoryPaymentsRepository implements PaymentsRepository {
  private orders = new Map<string, OrderEntity>();
  private payments = new Map<string, PaymentEntity>();

  async createOrder(seed: CreateOrderSeed): Promise<OrderEntity> {
    const now = new Date().toISOString();
    const orderId = rid('ord');
    const items: OrderItemEntity[] = seed.items.map((i) => ({
      id: rid('oi'),
      tenantId: seed.tenantId,
      orderId,
      courseVersionId: i.courseVersionId,
      learnerId: i.learnerId,
      unitAmount: i.unitAmount,
      fulfillmentStatus: 'pending'
    }));
    const order: OrderEntity = {
      id: orderId,
      tenantId: seed.tenantId,
      buyerType: seed.buyerType,
      buyerId: seed.buyerId,
      status: 'awaiting_payment',
      currency: seed.currency,
      totalAmount: items.reduce((s, i) => s + i.unitAmount, 0),
      ...(seed.description ? { description: seed.description } : {}),
      items,
      ...(seed.createdBy ? { createdBy: seed.createdBy } : {}),
      createdAt: now,
      updatedAt: now
    };
    this.orders.set(orderId, order);
    return clone(order);
  }

  async getOrder(tenantId: string, orderId: string): Promise<OrderEntity | null> {
    const o = this.orders.get(orderId);
    return o && o.tenantId === tenantId ? clone(o) : null;
  }

  async listOrders(
    tenantId: string,
    filter: { status?: string; buyerId?: string }
  ): Promise<OrderEntity[]> {
    return [...this.orders.values()]
      .filter((o) => o.tenantId === tenantId)
      .filter((o) => (filter.status ? o.status === filter.status : true))
      .filter((o) => (filter.buyerId ? o.buyerId === filter.buyerId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  async updateOrderStatus(tenantId: string, orderId: string, status: OrderStatus): Promise<void> {
    const o = this.orders.get(orderId);
    if (o && o.tenantId === tenantId) {
      o.status = status;
      o.updatedAt = new Date().toISOString();
    }
  }

  async createPayment(seed: CreatePaymentSeed): Promise<PaymentEntity> {
    const now = new Date().toISOString();
    const payment: PaymentEntity = {
      id: rid('pay'),
      tenantId: seed.tenantId,
      orderId: seed.orderId,
      provider: seed.provider,
      ...(seed.providerPaymentId ? { providerPaymentId: seed.providerPaymentId } : {}),
      method: seed.method,
      status: seed.status,
      amount: seed.amount,
      ...(seed.confirmationUrl ? { confirmationUrl: seed.confirmationUrl } : {}),
      ...(seed.idempotencyKey ? { idempotencyKey: seed.idempotencyKey } : {}),
      rawPayload: seed.rawPayload ?? {},
      createdAt: now,
      updatedAt: now
    };
    this.payments.set(payment.id, payment);
    return clone(payment);
  }

  async updatePaymentStatus(
    tenantId: string,
    paymentId: string,
    status: PaymentRowStatus,
    paidAt?: string
  ): Promise<void> {
    const p = this.payments.get(paymentId);
    if (p && p.tenantId === tenantId) {
      p.status = status;
      if (paidAt) p.paidAt = paidAt;
      p.updatedAt = new Date().toISOString();
    }
  }

  async findOrderByProviderPaymentId(
    providerPaymentId: string
  ): Promise<{ tenantId: string; order: OrderEntity; payment: PaymentEntity } | null> {
    const p = [...this.payments.values()].find((x) => x.providerPaymentId === providerPaymentId);
    if (!p) return null;
    const o = this.orders.get(p.orderId);
    if (!o) return null;
    return { tenantId: o.tenantId, order: clone(o), payment: clone(p) };
  }

  async markItemFulfilled(
    tenantId: string,
    itemId: string,
    status: ItemFulfillmentStatus,
    enrollmentId?: string
  ): Promise<void> {
    for (const o of this.orders.values()) {
      if (o.tenantId !== tenantId) continue;
      const item = o.items.find((i) => i.id === itemId);
      if (item) {
        item.fulfillmentStatus = status;
        if (enrollmentId) item.enrollmentId = enrollmentId;
        o.updatedAt = new Date().toISOString();
        return;
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/in-memory-payments.repository.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/payments/payments.repository.ts apps/backend/src/modules/payments/in-memory-payments.repository.ts apps/backend/src/modules/payments/in-memory-payments.repository.test.ts
git commit -m "feat(backend): payments repository interface + in-memory impl"
```

---

## Task 8: Postgres repository implementation

**Files:**

- Create: `apps/backend/src/modules/payments/postgres-payments.repository.ts`

No standalone unit test (requires a live DB; covered by the in-memory contract + integration). Mirror `postgres-recertification-drafts.repository.ts` exactly for the `DatabaseService` injection, `db.query<Row>(...)` usage, and row→entity mapping. Implement every `PaymentsRepository` method with SQL against `payments.orders` / `payments.order_items` / `payments.payments`.

- [ ] **Step 1: Write the implementation**

Key requirements (full SQL — mirror recertification repo style):

- `createOrder`: insert order (`status='awaiting_payment'`, `total_amount` = sum of item `unitAmount`), then insert each item; return the assembled `OrderEntity` (re-read items). Wrap in a single `db.query` transaction if the service exposes one; otherwise sequential inserts (acceptable — fail-soft fulfillment tolerates partials, and order creation is admin-driven).
- `getOrder`: `select` order `where tenant_id=$1 and id=$2`, then `select` items `where order_id=$2`; map; return null if order missing.
- `listOrders`: `select ... where tenant_id=$1 [and status=$2] order by created_at desc`, batch-load items.
- `updateOrderStatus`: `update payments.orders set status=$3, updated_at=now() where tenant_id=$1 and id=$2`.
- `createPayment`: insert into `payments.payments` returning row; map.
- `updatePaymentStatus`: `update ... set status=$3, paid_at=coalesce($4, paid_at), updated_at=now() where tenant_id=$1 and id=$2`.
- `findOrderByProviderPaymentId`: `select * from payments.payments where provider_payment_id=$1`; then load order+items by `payment.order_id` (NO tenant filter on the payment lookup — the webhook has no tenant; tenant comes FROM the row).
- `markItemFulfilled`: `update payments.order_items set fulfillment_status=$3, enrollment_id=coalesce($4, enrollment_id), updated_at=now() where tenant_id=$1 and id=$2`.

Row interfaces: `OrderDbRow { id, tenant_id, buyer_type, buyer_id, status, currency, total_amount, description, created_by, created_at, updated_at }`, `OrderItemDbRow`, `PaymentDbRow`. Map `total_amount`/`unit_amount`/`amount` with `Number(row.total_amount)` (bigint comes back as string from pg). Map snake→camel; map `jsonb raw_payload` straight through.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit` (or `pnpm typecheck`)
Expected: no errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/payments/postgres-payments.repository.ts
git commit -m "feat(backend): postgres payments repository"
```

---

## Task 9: PaymentsService — order lifecycle, pay, mark-paid, cancel

**Files:**

- Create: `apps/backend/src/modules/payments/payments.service.ts`
- Test: `apps/backend/src/modules/payments/payments.service.test.ts`

The service depends on: `PAYMENTS_REPOSITORY`, `PAYMENT_PROVIDER`, `PaymentFulfillmentService` (Task 10 — for tests, inject a stub with `fulfill(order)`), `AuditService` (stub in tests). Use explicit `@Inject(...)` for every dependency (repo DI guard — see CLAUDE.md / known risk).

- [ ] **Step 1: Write the failing test**

```ts
// payments.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';
import { PaymentsService } from './payments.service.js';
import { NoopPaymentProvider } from '../../infrastructure/payments/payment.provider.js';
import { FakePaymentProvider } from '../../infrastructure/payments/fake-payment.provider.js';

const ctx = { tenantId: 't1', userId: 'admin' } as any;
const auditStub = { write: vi.fn(), writeCritical: vi.fn() } as any;
const makeFulfillment = () => ({ fulfill: vi.fn().mockResolvedValue(undefined) });

const orderReq = {
  buyerType: 'learner' as const,
  buyerId: 'l1',
  description: 'Курс ОТ',
  items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 150000 }]
};

describe('PaymentsService', () => {
  it('creates an order in awaiting_payment with a computed total', async () => {
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      makeFulfillment() as any,
      auditStub
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    expect(order.status).toBe('awaiting_payment');
    expect(order.totalAmount).toBe(150000);
  });

  it('mark-paid records a manual succeeded payment and runs fulfillment', async () => {
    const fulfillment = makeFulfillment();
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      fulfillment as any,
      auditStub
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    const updated = await svc.markPaid('t1', 'admin', order.id, { method: 'bank_transfer' }, ctx);
    expect(updated.status).toBe('paid');
    expect(fulfillment.fulfill).toHaveBeenCalledOnce();
  });

  it('mark-paid is idempotent on an already-paid order (no second fulfillment)', async () => {
    const fulfillment = makeFulfillment();
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      fulfillment as any,
      auditStub
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    await svc.markPaid('t1', 'admin', order.id, {}, ctx);
    await expect(svc.markPaid('t1', 'admin', order.id, {}, ctx)).rejects.toThrow(
      /invalid_order_transition|already/
    );
    expect(fulfillment.fulfill).toHaveBeenCalledOnce();
  });

  it('pay with Noop provider throws payment_disabled', async () => {
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      makeFulfillment() as any,
      auditStub
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    await expect(svc.pay('t1', order.id, ctx)).rejects.toThrow(/payment_disabled/);
  });

  it('pay with Fake provider returns a confirmation url + records a pending payment', async () => {
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new FakePaymentProvider(),
      makeFulfillment() as any,
      auditStub
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    const res = await svc.pay('t1', order.id, ctx);
    expect(res.confirmationUrl).toContain(order.id);
  });

  it('cancel works from awaiting_payment, fails from paid', async () => {
    const svc = new PaymentsService(
      new InMemoryPaymentsRepository(),
      new NoopPaymentProvider(),
      makeFulfillment() as any,
      auditStub
    );
    const order = await svc.createOrder('t1', 'admin', orderReq, ctx);
    const cancelled = await svc.cancelOrder('t1', 'admin', order.id, ctx);
    expect(cancelled.status).toBe('cancelled');

    const order2 = await svc.createOrder('t1', 'admin', orderReq, ctx);
    await svc.markPaid('t1', 'admin', order2.id, {}, ctx);
    await expect(svc.cancelOrder('t1', 'admin', order2.id, ctx)).rejects.toThrow(/cannot_cancel/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payments.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the service**

```ts
// payments.service.ts
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';
import { assertOrderTransition, canCancelOrder } from './payments.state-machine.js';
import type { CreateOrderRequest, MarkPaidRequest } from './payments.dto.js';
import type { OrderEntity } from './payments.types.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider
} from '../../infrastructure/payments/payment.provider.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../../common/context/request-context.js';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly repo: PaymentsRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PaymentFulfillmentService) private readonly fulfillment: PaymentFulfillmentService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async createOrder(
    tenantId: string,
    userId: string | undefined,
    req: CreateOrderRequest,
    ctx: RequestContext
  ): Promise<OrderEntity> {
    const order = await this.repo.createOrder({
      tenantId,
      buyerType: req.buyerType,
      buyerId: req.buyerId,
      currency: 'RUB',
      ...(req.description ? { description: req.description } : {}),
      ...(userId ? { createdBy: userId } : {}),
      items: req.items
    });
    await this.audit.write(
      tenantId,
      userId,
      'payments.order_created',
      'payments.order',
      order.id,
      null,
      { totalAmount: order.totalAmount, items: order.items.length },
      ctx
    );
    return order;
  }

  async getOrder(tenantId: string, orderId: string): Promise<OrderEntity> {
    const order = await this.repo.getOrder(tenantId, orderId);
    if (!order)
      throw new NotFoundException({ code: 'order_not_found', message: 'Заказ не найден' });
    return order;
  }

  async listOrders(tenantId: string, filter: { status?: string; buyerId?: string }) {
    return this.repo.listOrders(tenantId, filter);
  }

  async pay(tenantId: string, orderId: string, _ctx: RequestContext) {
    const order = await this.getOrder(tenantId, orderId);
    if (order.status !== 'awaiting_payment') {
      throw new BadRequestException({
        code: 'order_not_payable',
        message: 'Заказ не ожидает оплаты'
      });
    }
    const result = await this.provider.createPayment({
      tenantId,
      orderId: order.id,
      amount: order.totalAmount,
      currency: order.currency,
      description: order.description ?? `Заказ ${order.id}`
    });
    if (result.status === 'disabled') {
      throw new BadRequestException({
        code: 'payment_disabled',
        message: 'Онлайн-оплата временно недоступна'
      });
    }
    await this.repo.createPayment({
      tenantId,
      orderId: order.id,
      provider: this.provider.id as any,
      providerPaymentId: result.providerPaymentId,
      method: 'card',
      amount: order.totalAmount,
      status: 'pending',
      ...(result.confirmationUrl ? { confirmationUrl: result.confirmationUrl } : {})
    });
    return { confirmationUrl: result.confirmationUrl };
  }

  async markPaid(
    tenantId: string,
    userId: string | undefined,
    orderId: string,
    req: MarkPaidRequest,
    ctx: RequestContext
  ): Promise<OrderEntity> {
    const order = await this.getOrder(tenantId, orderId);
    assertOrderTransition(order.status, 'paid'); // throws invalid_order_transition if not awaiting_payment
    await this.repo.createPayment({
      tenantId,
      orderId: order.id,
      provider: 'manual',
      method: req.method ?? 'bank_transfer',
      amount: order.totalAmount,
      status: 'succeeded',
      idempotencyKey: `manual:${order.id}`
    });
    await this.repo.updateOrderStatus(tenantId, order.id, 'paid');
    await this.audit.write(
      tenantId,
      userId,
      'payments.order_marked_paid',
      'payments.order',
      order.id,
      { status: order.status },
      { status: 'paid', method: req.method ?? 'bank_transfer' },
      ctx
    );
    const paid = await this.getOrder(tenantId, order.id);
    await this.fulfillment.fulfill(paid, ctx);
    return this.getOrder(tenantId, order.id);
  }

  async cancelOrder(
    tenantId: string,
    userId: string | undefined,
    orderId: string,
    ctx: RequestContext
  ): Promise<OrderEntity> {
    const order = await this.getOrder(tenantId, orderId);
    if (!canCancelOrder(order.status)) {
      throw new BadRequestException({
        code: 'cannot_cancel',
        message: 'Заказ нельзя отменить в текущем статусе'
      });
    }
    await this.repo.updateOrderStatus(tenantId, order.id, 'cancelled');
    await this.audit.write(
      tenantId,
      userId,
      'payments.order_cancelled',
      'payments.order',
      order.id,
      { status: order.status },
      { status: 'cancelled' },
      ctx
    );
    return this.getOrder(tenantId, order.id);
  }
}
```

> Verify the `AuditService.write(...)` signature against an existing caller (e.g. esign.service.ts) and adjust arg order if needed. The repo convention is `this.audit(tenantId, actorId, action, entityType, entityId, oldValues, newValues, ctx, metadata?)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payments.service.test.ts --no-file-parallelism`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments/payments.service.ts apps/backend/src/modules/payments/payments.service.test.ts
git commit -m "feat(backend): PaymentsService — order lifecycle, pay, mark-paid, cancel"
```

---

## Task 10: PaymentFulfillmentService — paid → enroll (idempotent, fail-soft)

**Files:**

- Create: `apps/backend/src/modules/payments/payment-fulfillment.service.ts`
- Test: `apps/backend/src/modules/payments/payment-fulfillment.service.test.ts`

Fulfillment groups order items by `courseVersionId` and calls `MvpService.createBulkEnrollments` once per group, then marks items `enrolled` with the resulting enrollment id, then sets order `fulfilled`. Idempotent: items already `enrolled` are skipped. Fail-soft: a thrown error leaves the order `paid` (NOT `fulfilled`) so it can be retried; the error is swallowed-and-logged, never rethrown to the caller (payment success must not be lost).

> IMPORTANT — verify `createBulkEnrollments` signature before writing. From the codebase it is `createBulkEnrollments(tenantId, userId, body, ctx)` returning a partial-success outcome `{ rows: [{ learnerId, enrollmentId?, status }] }`. Inspect `mvp.service.ts:1968` and the bulk-enrollment DTO to get the exact `body` shape (course/group ref + learners + `idempotencyKey`). Adapt the call + result mapping below to the real shape. The test uses a stub, so it pins the _contract you depend on_, not the real MvpService.

- [ ] **Step 1: Write the failing test**

```ts
// payment-fulfillment.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';

const ctx = { tenantId: 't1', userId: 'admin' } as any;

function makeMvp(outcomeByCourse: Record<string, { learnerId: string; enrollmentId: string }[]>) {
  return {
    createBulkEnrollments: vi.fn(async (_t: string, _u: string, body: any) => ({
      rows: outcomeByCourse[body.courseVersionId].map((r) => ({
        learnerId: r.learnerId,
        enrollmentId: r.enrollmentId,
        status: 'created'
      }))
    }))
  };
}

async function seedPaidOrder(repo: InMemoryPaymentsRepository, items: any[]) {
  const order = await repo.createOrder({
    tenantId: 't1',
    buyerType: 'counterparty',
    buyerId: 'org1',
    currency: 'RUB',
    items
  });
  await repo.updateOrderStatus('t1', order.id, 'paid');
  return repo.getOrder('t1', order.id);
}

describe('PaymentFulfillmentService', () => {
  it('enrolls each item, marks items enrolled, sets order fulfilled', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [
      { courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 },
      { courseVersionId: 'cv1', learnerId: 'l2', unitAmount: 100 }
    ]);
    const mvp = makeMvp({
      cv1: [
        { learnerId: 'l1', enrollmentId: 'e1' },
        { learnerId: 'l2', enrollmentId: 'e2' }
      ]
    });
    const svc = new PaymentFulfillmentService(repo, mvp as any);

    await svc.fulfill(order!, ctx);

    expect(mvp.createBulkEnrollments).toHaveBeenCalledOnce(); // one course group
    const after = await repo.getOrder('t1', order!.id);
    expect(after!.status).toBe('fulfilled');
    expect(after!.items.every((i) => i.fulfillmentStatus === 'enrolled')).toBe(true);
    expect(after!.items.map((i) => i.enrollmentId).sort()).toEqual(['e1', 'e2']);
  });

  it('is idempotent — re-running does not double-enroll', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [
      { courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 }
    ]);
    const mvp = makeMvp({ cv1: [{ learnerId: 'l1', enrollmentId: 'e1' }] });
    const svc = new PaymentFulfillmentService(repo, mvp as any);

    await svc.fulfill(order!, ctx);
    const reloaded = await repo.getOrder('t1', order!.id);
    await svc.fulfill(reloaded!, ctx); // already fulfilled / items enrolled

    expect(mvp.createBulkEnrollments).toHaveBeenCalledOnce();
  });

  it('fail-soft — enrollment error leaves order paid, never throws', async () => {
    const repo = new InMemoryPaymentsRepository();
    const order = await seedPaidOrder(repo, [
      { courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 }
    ]);
    const mvp = { createBulkEnrollments: vi.fn().mockRejectedValue(new Error('db down')) };
    const svc = new PaymentFulfillmentService(repo, mvp as any);

    await expect(svc.fulfill(order!, ctx)).resolves.toBeUndefined(); // does not throw
    const after = await repo.getOrder('t1', order!.id);
    expect(after!.status).toBe('paid'); // retriable
    expect(after!.items[0]!.fulfillmentStatus).toBe('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payment-fulfillment.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the service**

```ts
// payment-fulfillment.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';

import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';
import type { OrderEntity, OrderItemEntity } from './payments.types.js';
import { MvpService } from '../mvp/mvp.service.js';
import type { RequestContext } from '../../common/context/request-context.js';

@Injectable()
export class PaymentFulfillmentService {
  private readonly logger = new Logger(PaymentFulfillmentService.name);

  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly repo: PaymentsRepository,
    @Inject(MvpService) private readonly mvp: MvpService
  ) {}

  /**
   * paid → enroll each item → fulfilled. Idempotent (skips items already 'enrolled').
   * Fail-soft: any error leaves the order 'paid' (retriable) and is swallowed — a successful
   * payment must never be lost because enrollment hiccuped.
   */
  async fulfill(order: OrderEntity, ctx: RequestContext): Promise<void> {
    try {
      const pending = order.items.filter((i) => i.fulfillmentStatus === 'pending');
      if (pending.length === 0) {
        if (order.status === 'paid') {
          await this.repo.updateOrderStatus(order.tenantId, order.id, 'fulfilled');
        }
        return;
      }

      const byCourse = new Map<string, OrderItemEntity[]>();
      for (const item of pending) {
        const list = byCourse.get(item.courseVersionId) ?? [];
        list.push(item);
        byCourse.set(item.courseVersionId, list);
      }

      for (const [courseVersionId, items] of byCourse) {
        // ADAPT to the real createBulkEnrollments body shape (see Task 10 IMPORTANT note).
        const outcome = await this.mvp.createBulkEnrollments(
          order.tenantId,
          order.createdBy ?? 'system',
          {
            courseVersionId,
            learnerIds: items.map((i) => i.learnerId),
            idempotencyKey: `payment:${order.id}:${courseVersionId}`
          } as any,
          ctx
        );
        const enrollmentByLearner = new Map<string, string>();
        for (const row of (outcome as any).rows ?? []) {
          if (row.enrollmentId) enrollmentByLearner.set(row.learnerId, row.enrollmentId);
        }
        for (const item of items) {
          const enrollmentId = enrollmentByLearner.get(item.learnerId);
          await this.repo.markItemFulfilled(order.tenantId, item.id, 'enrolled', enrollmentId);
        }
      }

      await this.repo.updateOrderStatus(order.tenantId, order.id, 'fulfilled');
    } catch (err) {
      // Fail-soft: keep the order 'paid' so a later retry (webhook redelivery / cron / manual)
      // can complete fulfillment. NEVER rethrow — payment success is already recorded.
      this.logger.error(
        `Fulfillment failed for order ${order.id} (kept 'paid' for retry): ${String(err)}`
      );
    }
  }
}
```

> The class-field `private readonly logger = new Logger(...)` needs no DI — keep `import { Logger } from '@nestjs/common'`, but do NOT add `Logger` to the module providers. Constructor is exactly `(repo, mvp)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payment-fulfillment.service.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments/payment-fulfillment.service.ts apps/backend/src/modules/payments/payment-fulfillment.service.test.ts
git commit -m "feat(backend): PaymentFulfillmentService — idempotent fail-soft enroll"
```

---

## Task 11: Module wiring + provider factory + AppModule registration

**Files:**

- Create: `apps/backend/src/modules/payments/payments.module.ts`
- Modify: `apps/backend/src/app.module.ts` (add `PaymentsModule` to `imports`)

- [ ] **Step 1: Write the module**

```ts
// payments.module.ts
import { Module } from '@nestjs/common';

import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PaymentsController } from './payments.controller.js';
import { PAYMENTS_REPOSITORY } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';
import { PaymentsWebhookController } from './payments-webhook.controller.js';
import { PostgresPaymentsRepository } from './postgres-payments.repository.js';
import { backendEnv } from '../../env.js';
import {
  PAYMENT_PROVIDER,
  NoopPaymentProvider
} from '../../infrastructure/payments/payment.provider.js';
import { FakePaymentProvider } from '../../infrastructure/payments/fake-payment.provider.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { MvpModule } from '../mvp/mvp.module.js';

@Module({
  imports: [AuditModule, MvpModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    PaymentsService,
    PaymentFulfillmentService,
    {
      provide: PAYMENTS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryPaymentsRepository()
          : new PostgresPaymentsRepository(db),
      inject: [DatabaseService]
    },
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () => {
        // STAGING: synthetic payment provider for end-to-end QA (env refinement forbids it in prod).
        if (backendEnv.PAYMENTS_ENABLED && backendEnv.PAYMENTS_PROVIDER === 'fake') {
          return new FakePaymentProvider();
        }
        // ЮKassa adapter not implemented yet — fall back to Noop so prod can't believe an order
        // is paid online. Swap this branch for `new YooKassaPaymentProvider(...)`.
        if (backendEnv.PAYMENTS_ENABLED && backendEnv.PAYMENTS_PROVIDER === 'yookassa') {
          console.warn(
            '[payments] PAYMENTS_PROVIDER=yookassa requested but adapter not implemented — using Noop'
          );
        }
        return new NoopPaymentProvider();
      }
    }
  ],
  exports: [PaymentsService]
})
export class PaymentsModule {}
```

> Verify `ALLOW_IN_MEMORY_STATE` exists in `backendEnv` (it gates MVP persistence per CLAUDE.md). If the in-memory toggle has a different name, use that. `MvpModule` must `export` `MvpService` for the fulfillment injection — confirm it does; if not, this is a real coupling to add.

- [ ] **Step 2: Register in AppModule**

Add `PaymentsModule` to the `imports` array in `apps/backend/src/app.module.ts` (alongside `EsignModule`, `MvpModule`, etc.).

- [ ] **Step 3: Typecheck + boot-safety**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: no errors. (If a backend e2e boot test exists, run it to confirm DI resolves: `pnpm --filter @cdoprof/backend exec vitest run src/**/app.boot*.test.ts --no-file-parallelism` if present.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/payments/payments.module.ts apps/backend/src/app.module.ts
git commit -m "feat(backend): wire PaymentsModule + provider factory (dormant Noop default)"
```

---

## Task 12: Controllers — guarded PaymentsController + unguarded webhook + http integration

**Files:**

- Create: `apps/backend/src/modules/payments/payments.controller.ts`
- Create: `apps/backend/src/modules/payments/payments-webhook.controller.ts`
- Test: `apps/backend/src/modules/payments/payments.http.integration.test.ts`

- [ ] **Step 1: Write the guarded controller**

```ts
// payments.controller.ts
import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';

import {
  CreateOrderRequest,
  CreateSelfOrderRequest,
  MarkPaidRequest,
  OrdersFilter
} from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';
import type { RequestContext } from '../../common/context/request-context.js';

@Controller()
@UseGuards(TenantGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post('orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.write')
  async createOrder(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateOrderRequest, raw);
    return this.payments.createOrder(c.tenantId!, c.userId, b, c);
  }

  @Post('me/orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.self_purchase')
  async createSelfOrder(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateSelfOrderRequest, raw);
    // Buyer is the session learner: buyerType='learner', buyerId=c.userId.
    return this.payments.createOrder(
      c.tenantId!,
      c.userId,
      {
        buyerType: 'learner',
        buyerId: c.userId!,
        ...(b.description ? { description: b.description } : {}),
        items: b.items
      },
      c
    );
  }

  @Get('orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.read')
  listOrders(@CurrentContext() c: RequestContext, @Query() q: OrdersFilter) {
    return this.payments.listOrders(c.tenantId!, { ...(q.status ? { status: q.status } : {}) });
  }

  @Get('me/orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.self_purchase')
  listMyOrders(@CurrentContext() c: RequestContext) {
    return this.payments.listOrders(c.tenantId!, { buyerId: c.userId });
  }

  @Get('orders/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.read')
  getOrder(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.payments.getOrder(c.tenantId!, id);
  }

  @Post('orders/:id/pay')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.self_purchase')
  pay(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.payments.pay(c.tenantId!, id, c);
  }

  @Post('orders/:id/mark-paid')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.write')
  async markPaid(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(MarkPaidRequest, raw);
    return this.payments.markPaid(c.tenantId!, c.userId, id, b, c);
  }

  @Post('orders/:id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.write')
  cancel(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.payments.cancelOrder(c.tenantId!, c.userId, id, c);
  }
}
```

> NOTE: `POST /orders/:id/pay` is under `payments.self_purchase` (the buyer pays). If admins should also trigger `pay`, add a second `@RequirePermissions` decorator is NOT OR — instead the simplest is to allow either via a dedicated permission; for this iteration keep `self_purchase` (admin uses mark-paid). Document this in the handoff.

- [ ] **Step 2: Write the unguarded webhook controller**

```ts
// payments-webhook.controller.ts
import { Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider
} from '../../infrastructure/payments/payment.provider.js';

/**
 * Unguarded payment webhook (mirror PublicVerifyController). The provider does NOT carry our
 * JWT / x-tenant-id — it POSTs to a public URL. Tenant is resolved from the stored payment row
 * (provider_payment_id → tenant_id); authenticity is the provider's signature verification
 * inside parseWebhook. Noop returns null → 200 no-op.
 *
 * Requires the raw body. Ensure main.ts keeps a rawBody for this route (NestFactory rawBody:true,
 * or a route-scoped raw body parser) — JSON-parsed bodies break signature verification.
 */
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENTS_REPOSITORY) private readonly repo: PaymentsRepository,
    @Inject(PaymentFulfillmentService) private readonly fulfillment: PaymentFulfillmentService
  ) {}

  @Post('webhook')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const event = await this.provider.parseWebhook(raw, headers);
    if (!event) return { ok: true }; // unrecognized / Noop / bad signature → no-op

    const found = await this.repo.findOrderByProviderPaymentId(event.providerPaymentId);
    if (!found) return { ok: true }; // unknown payment id → no-op (idempotent)

    const { tenantId, order, payment } = found;
    if (event.status === 'succeeded') {
      if (payment.status !== 'succeeded') {
        await this.repo.updatePaymentStatus(
          tenantId,
          payment.id,
          'succeeded',
          new Date().toISOString()
        );
      }
      if (order.status === 'awaiting_payment') {
        await this.repo.updateOrderStatus(tenantId, order.id, 'paid');
      }
      const paid = await this.repo.getOrder(tenantId, order.id);
      if (paid) await this.fulfillment.fulfill(paid, { tenantId, userId: order.createdBy } as any);
    } else {
      await this.repo.updatePaymentStatus(tenantId, payment.id, event.status);
    }
    return { ok: true };
  }
}
```

> The webhook must NOT be under `@UseGuards(TenantGuard)`. It's a separate `@Controller('payments')` with only the `webhook` route. The guarded `PaymentsController` uses `@Controller()` (root) so its routes (`orders`, `me/orders`) don't collide. Confirm route paths don't clash (`POST /payments/webhook` vs `POST /orders`).

- [ ] **Step 3: Write the http integration test** (stub-controller permission-boundary pattern — mirror `mvp.http.integration.test.ts`)

```ts
// payments.http.integration.test.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Boot a minimal Nest app with PaymentsController + PaymentsWebhookController, a stub PaymentsService,
// a stub PaymentsRepository, a NoopPaymentProvider, and a permission-asserting guard harness.
// Mirror the existing mvp.http.integration.test.ts setup exactly (same fake guards + envelope filter).

describe('payments http permission boundaries', () => {
  let app: INestApplication;
  beforeAll(async () => {
    /* boot minimal app — copy harness from mvp.http.integration.test.ts */
  });
  afterAll(async () => app?.close());

  it('POST /orders requires payments.write (403 without)', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-test-permissions', '') // no perms
      .send({
        buyerType: 'learner',
        buyerId: 'l1',
        items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 }]
      })
      .expect(403);
  });

  it('POST /orders succeeds with payments.write', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-test-permissions', 'payments.write')
      .send({
        buyerType: 'learner',
        buyerId: 'l1',
        items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 }]
      })
      .expect(201);
  });

  it('GET /me/orders requires payments.self_purchase', async () => {
    await request(app.getHttpServer()).get('/me/orders').set('x-test-permissions', '').expect(403);
  });

  it('POST /payments/webhook is reachable WITHOUT auth (no TenantGuard) and returns ok', async () => {
    await request(app.getHttpServer())
      .post('/payments/webhook')
      .send({ providerPaymentId: 'unknown', status: 'succeeded' })
      .expect(201)
      .expect((r) => expect(r.body.data ?? r.body).toMatchObject({ ok: true }));
  });
});
```

> Copy the exact minimal-app harness (fake `TenantGuard`/`PermissionGuard` reading a test header, `HttpExceptionEnvelopeFilter`) from `mvp.http.integration.test.ts`. Don't invent a new harness. The webhook test proves the route is NOT behind TenantGuard.

- [ ] **Step 4: Run the integration test**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payments.http.integration.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments/payments.controller.ts apps/backend/src/modules/payments/payments-webhook.controller.ts apps/backend/src/modules/payments/payments.http.integration.test.ts
git commit -m "feat(backend): payments controllers (guarded CRUD + unguarded webhook) + http integration"
```

---

## Task 13: Frontend feature module + admin orders page + navigation

**Files:**

- Create: `apps/frontend/src/features/payments/types.ts`
- Create: `apps/frontend/src/features/payments/api.ts`
- Create: `apps/frontend/src/features/payments/hooks.ts`
- Create: `apps/frontend/src/features/payments/screens.tsx`
- Create: `apps/frontend/app/admin/orders/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts` (add `routeMeta` + `navigationModel` entries)
- Test: `apps/frontend/src/features/payments/api.contract.test.ts`

Follow the existing feature conventions (e.g. `features/recertification/`): `apiRequest` from `src/lib/api/client.ts` (auto-unwraps the envelope); mutations via `useState`+async (`useDomainMutations.wrap`), NOT React Query; `exactOptionalPropertyTypes` conditional spreads.

- [ ] **Step 1: Write the failing api.contract test**

```ts
// api.contract.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listOrders, createOrder, markOrderPaid } from './api.js';

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: payload,
            meta: { requestId: 'r', correlationId: 'c', timestamp: 't' }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
    )
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('payments api', () => {
  it('listOrders unwraps the envelope to an array', async () => {
    stubFetch([{ id: 'o1', status: 'awaiting_payment', totalAmount: 150000, items: [] }]);
    const orders = await listOrders();
    expect(orders[0].id).toBe('o1');
  });

  it('createOrder posts items and returns the created order', async () => {
    stubFetch({ id: 'o2', status: 'awaiting_payment', totalAmount: 100, items: [] });
    const order = await createOrder({
      buyerType: 'learner',
      buyerId: 'l1',
      items: [{ courseVersionId: 'cv1', learnerId: 'l1', unitAmount: 100 }]
    });
    expect(order.id).toBe('o2');
  });

  it('markOrderPaid hits the mark-paid endpoint', async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { id: 'o1', status: 'paid', items: [] }, meta: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', spy);
    await markOrderPaid('o1', { method: 'bank_transfer' });
    expect(spy.mock.calls[0][0]).toContain('/orders/o1/mark-paid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/payments/api.contract.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./api.js`.

- [ ] **Step 3: Write types + api**

```ts
// types.ts
export type OrderStatus = 'draft' | 'awaiting_payment' | 'paid' | 'fulfilled' | 'cancelled';
export interface OrderItem {
  id: string;
  courseVersionId: string;
  learnerId: string;
  unitAmount: number;
  fulfillmentStatus: string;
  enrollmentId?: string;
}
export interface Order {
  id: string;
  buyerType: 'learner' | 'counterparty';
  buyerId: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number;
  description?: string;
  items: OrderItem[];
  createdAt: string;
}
export interface CreateOrderInput {
  buyerType: 'learner' | 'counterparty';
  buyerId: string;
  description?: string;
  items: { courseVersionId: string; learnerId: string; unitAmount: number }[];
}
export interface MarkPaidInput {
  method?: 'manual' | 'bank_transfer';
  note?: string;
}
```

```ts
// api.ts
import { apiRequest } from '../../lib/api/client.js';
import type { CreateOrderInput, MarkPaidInput, Order } from './types.js';

export const listOrders = (status?: string) =>
  apiRequest<Order[]>(`/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`);

export const getOrder = (id: string) => apiRequest<Order>(`/orders/${id}`);

export const createOrder = (input: CreateOrderInput) =>
  apiRequest<Order>('/orders', { method: 'POST', body: JSON.stringify(input) });

export const markOrderPaid = (id: string, input: MarkPaidInput) =>
  apiRequest<Order>(`/orders/${id}/mark-paid`, { method: 'POST', body: JSON.stringify(input) });

export const cancelOrder = (id: string) =>
  apiRequest<Order>(`/orders/${id}/cancel`, { method: 'POST' });

export const listMyOrders = () => apiRequest<Order[]>('/me/orders');
```

> Match the exact `apiRequest` signature (URL + options) used by `features/recertification/api.ts`. Adjust import path/suffix to the codebase convention.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/payments/api.contract.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Write hooks + screens + admin page**

- `hooks.ts`: `useOrders(status?)` loads via `listOrders` into `useState` + loading/error; `useOrderMutations()` exposes `markPaid`/`cancel`/`create` wrapped with `useDomainMutations.wrap` (mirror `features/recertification/hooks.ts`).
- `screens.tsx`: `OrdersScreen` — `PageContainer`/`PageHeader`/`SectionCard`; `DataTable` from `@cdoprof/ui` with columns (id, buyer, status chip, total ₽ = `totalAmount/100`, actions); a create-order form (buyer + items + amount in рубли → ×100 to kopecks on submit); `mark-paid` + `cancel` buttons. Status is a plain `<span>` with a status label (not StatusChip, per §5.131 convention for these badges) OR `StatusChip` if that's the table convention — match `features/recertification/screens.tsx`.
- `app/admin/orders/page.tsx`: `<ProtectedPage>` wrapping `<OrdersScreen/>`.
- `navigation/model.ts`: add `routeMeta['/admin/orders'] = { access policy under 'payments.read' }` and a `navigationModel` entry (label «Заказы / Оплаты», admin nav slot). Mirror an existing admin entry exactly.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit` and `npx eslint apps/frontend/src/features/payments --max-warnings=0`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/payments/ apps/frontend/app/admin/orders/ apps/frontend/src/features/navigation/model.ts
git commit -m "feat(frontend): payments feature + /admin/orders page + navigation"
```

---

## Task 14: Frontend learner payment history + e2e

**Files:**

- Create: `apps/frontend/app/learner/payments/page.tsx` (or a section in the learner cabinet — match where other learner sections live)
- Modify: `apps/frontend/src/features/payments/screens.tsx` (add `MyPaymentsScreen`)
- Modify: `apps/frontend/src/features/navigation/model.ts` (learner entry under `payments.self_purchase`)
- Test: `apps/frontend/src/e2e/payments.e2e.test.ts`

- [ ] **Step 1: Write `MyPaymentsScreen`**

History list via `listMyOrders()`: table of orders (course/description, total ₽, status). For an `awaiting_payment` order, an «Оплатить» button calls `POST /orders/:id/pay`; on `payment_disabled` (Noop) show inline «Онлайн-оплата временно недоступна». Status as plain `<span>` (per §5.131).

- [ ] **Step 2: Write the failing e2e (permission/routing — NO render())**

```ts
// payments.e2e.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateRouteAccess } from '<route-access-util>';
import { getVisibleNavigation } from '<nav-util>';

describe('payments routing', () => {
  it('/admin/orders requires payments.read', () => {
    expect(evaluateRouteAccess('/admin/orders', { permissions: [] }).allowed).toBe(false);
    expect(evaluateRouteAccess('/admin/orders', { permissions: ['payments.read'] }).allowed).toBe(
      true
    );
  });

  it('/learner/payments requires payments.self_purchase', () => {
    expect(
      evaluateRouteAccess('/learner/payments', { permissions: ['payments.self_purchase'] }).allowed
    ).toBe(true);
  });

  it('learner nav shows payments entry for a self_purchase learner', () => {
    const nav = getVisibleNavigation({ permissions: ['payments.self_purchase'] });
    expect(JSON.stringify(nav)).toContain('payments');
  });
});
```

> Use the EXACT util imports/signatures from an existing e2e (e.g. `admin-bulk-enrollment.e2e.test.ts` / `canonical-e2e-readiness.e2e.test.ts`). Match `evaluateRouteAccess` + `getVisibleNavigation` call shapes.

- [ ] **Step 3: Run → fail → implement page/nav → pass**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/payments.e2e.test.ts --no-file-parallelism`
First Expected: FAIL (route not registered). After adding the page + nav entries: PASS.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit` + `npx eslint apps/frontend/src/features/payments apps/frontend/app/learner/payments --max-warnings=0`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/app/learner/payments/ apps/frontend/src/features/payments/screens.tsx apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/payments.e2e.test.ts
git commit -m "feat(frontend): learner payment history + pay button + e2e"
```

---

## Task 15: Docs — env example, README state, handoff

**Files:**

- Modify: `infra/.env.production.example` (add the `PAYMENTS_*` block, dormant)
- Modify: `README.md` §2 (Current Stage / Last Completed / Current / Next / Last Updated)
- Modify: `LMS_AGENT_HANDOFF.md` §5 (append `### 5.133` — adjust to the next free number)
- Modify: `docs/superpowers/plans/2026-06-20-phase-7-payment-provider-seam.md` (tick all checkboxes)

- [ ] **Step 1: Add env example**

```dotenv
# Payments seam (Phase 7) — ships dormant. Online payment OFF; manual bank-transfer mark-paid still works.
# Activate with a real ЮKassa adapter + PAYMENTS_ENABLED=true + PAYMENTS_PROVIDER=yookassa.
PAYMENTS_ENABLED=false
PAYMENTS_PROVIDER=noop
PAYMENTS_CURRENCY=RUB
```

- [ ] **Step 2: Update README §2 + handoff** per the after-session protocol (CLAUDE.md). Summarize: dormant payment seam, migration 0054, permissions `payments.read/write/self_purchase`, manual mark-paid works, ЮKassa/54-ФЗ/PDF/landing deferred.

- [ ] **Step 3: Run the full verification gate**

Run:

```bash
pnpm typecheck
# isolated backend payments suite:
pnpm --filter @cdoprof/backend exec vitest run src/modules/payments src/infrastructure/payments src/env.payments.test.ts --no-file-parallelism
pnpm --filter @cdoprof/frontend exec vitest run src/features/payments src/e2e/payments.e2e.test.ts --no-file-parallelism
npx eslint apps/backend/src/modules/payments apps/backend/src/infrastructure/payments apps/frontend/src/features/payments --max-warnings=0
```

Expected: typecheck 8/8, all payments suites green, ESLint clean.

- [ ] **Step 4: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md infra/.env.production.example docs/superpowers/plans/2026-06-20-phase-7-payment-provider-seam.md
git commit -m "docs: Phase 7 payment seam — env example, README state, handoff §5.133"
```

---

## Self-review checklist (run before execution)

- [ ] **Spec coverage:** order domain (T4,T5,T7,T8), seam + Noop/Fake (T1,T2), env + prod-guard (T3), state machines (T6), lifecycle + mark-paid + pay + cancel (T9), idempotent fail-soft fulfillment (T10), wiring + factory (T11), guarded + unguarded webhook (T12), admin UI (T13), learner history (T14), docs (T15). ✅ every spec section maps to a task.
- [ ] **Deferred items NOT built:** ЮKassa adapter, 54-ФЗ receipt, invoice/act PDF, checkout landing, refund flow. ✅
- [ ] **Type consistency:** `OrderEntity`/`OrderItemEntity`/`PaymentEntity` (T5) reused in repo (T7,T8), service (T9), fulfillment (T10), controllers (T12). `PAYMENT_PROVIDER`/`PAYMENTS_REPOSITORY` tokens consistent. `createBulkEnrollments` call shape flagged for verification (T10).
- [ ] **Money:** integer kopecks everywhere; ₽ conversion (`/100`, `×100`) only at the frontend boundary (T13).

## Risks / verification notes for the implementer

1. **`createBulkEnrollments` real signature** (T10) — the stub pins the contract; verify the real `(tenantId, userId, body, ctx)` shape + outcome `rows` against `mvp.service.ts:1968` and adapt. This is the single highest-risk coupling.
2. **`MvpModule` must export `MvpService`** (T11) — confirm; the fulfillment service injects it.
3. **Raw body for webhook** (T12) — real signature verification needs the raw request body; Noop/Fake don't, but wire `rawBody` now so the ЮKassa adapter doesn't require a main.ts change later.
4. **`AuditService.write` arg order** (T9) — verify against an existing caller.
5. **`ALLOW_IN_MEMORY_STATE` toggle name** (T11) — confirm the env flag that selects in-memory vs postgres.
6. **Cyrillic-path test crashes** — always run payments suites isolated with `--no-file-parallelism`; never the full backend suite locally (see CLAUDE.md Gotchas).
