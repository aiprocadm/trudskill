# Phase 7 Payments Multi-Provider Activation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Activate online payment by refactoring the dormant Phase 7 seam to a registry + per-tenant resolver (mirror of Phase 8 webinars) and adding four real acquirer adapters (ЮKassa, Т-Касса/Tinkoff, CloudPayments, Robokassa).

**Architecture:** A `PAYMENT_PROVIDER_REGISTRY` (Map<code, provider>) holds all compiled-in providers as env-credentialed singletons (one platform merchant). `PaymentProviderResolver.forTenant(tenantId)` picks the provider by the tenant's saved code from `payments.payment_provider_settings`. The unguarded webhook uses a provider-specific path `/payments/webhook/:providerCode` so it knows which adapter parses. Credentials live in env; an adapter with blank creds is omitted from the registry.

**Tech Stack:** NestJS (DI, guards), PostgreSQL (migration 0056), native `fetch` for outbound HTTP, Node `crypto` for signatures, vitest (mocked `fetch`), Next.js frontend.

**Spec:** [docs/superpowers/specs/2026-06-22-phase-7-payments-multi-provider-activation-design.md](../specs/2026-06-22-phase-7-payments-multi-provider-activation-design.md)

---

## File Structure

**Backend — seam (`apps/backend/src/infrastructure/payments/`):**

- Modify `payment.provider.ts` — add `PaymentProviderCode`, rename `id`→`code`, add `webhookAck?`, add `PAYMENT_PROVIDER_REGISTRY` token + `PaymentProviderRegistry` type; remove `PAYMENT_PROVIDER` token.
- Modify `fake-payment.provider.ts` — `id`→`code`.
- Create `yookassa-payment.provider.ts`, `tinkoff-payment.provider.ts`, `cloudpayments-payment.provider.ts`, `robokassa-payment.provider.ts` (+ `*.test.ts` each).

**Backend — module (`apps/backend/src/modules/payments/`):**

- Create `payment-provider-settings.repository.ts` (interface + token), `in-memory-payment-provider-settings.repository.ts`, `postgres-payment-provider-settings.repository.ts`, `payment-provider-settings.service.ts`, `payment-provider-resolver.service.ts` (+ tests).
- Modify `payments.service.ts` (use resolver in `pay()`), `payments-webhook.controller.ts` (provider-specific path + registry), `payments.controller.ts` (settings endpoints), `payments.dto.ts` (settings DTO), `payments.module.ts` (registry + resolver + settings wiring), `payments.types.ts` (extend `PaymentProviderId`), `payments.http.integration.test.ts`.

**Backend — global:** `migrations/0056_payments_provider_settings.sql` (+ test), `env.schema.ts`, `env.payments.test.ts`, `main.ts`, `infra/.env.production.example`.

**Frontend (`apps/frontend/src/features/payments/`):** settings api + screen, `app/admin/payments/settings/page.tsx`, `features/navigation/model.ts`, `api.contract.test.ts`, e2e.

---

## Task 1: Migration 0056 — provider settings table + `payments.configure`

**Files:**

- Create: `apps/backend/migrations/0056_payments_provider_settings.sql`
- Test: `apps/backend/src/modules/payments/migration-0056.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// apps/backend/src/modules/payments/migration-0056.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'apps/backend/migrations/0056_payments_provider_settings.sql'),
  'utf8'
);

describe('migration 0056', () => {
  it('creates payments.payment_provider_settings', () => {
    expect(sql).toMatch(/create table if not exists payments\.payment_provider_settings/);
    expect(sql).toMatch(/tenant_id text primary key/);
    expect(sql).toMatch(/provider_code text not null default 'noop'/);
    expect(sql).toMatch(/enabled boolean not null default false/);
  });
  it('seeds the payments.configure permission to admin roles', () => {
    expect(sql).toMatch(/'payments\.configure'/);
    expect(sql).toMatch(/platform_admin/);
    expect(sql).toMatch(/tenant_admin/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/migration-0056.test.ts --no-file-parallelism`
Expected: FAIL — file not found (ENOENT).

- [x] **Step 3: Write the migration**

```sql
-- apps/backend/migrations/0056_payments_provider_settings.sql
-- Phase 7 activation — multi-provider per-tenant payment selection.
-- Mirrors 0055 (webinar provider seam): a per-tenant NON-SECRET provider settings table +
-- the payments.configure permission. Acquirer credentials stay in env (one platform merchant);
-- per-tenant own-merchant secrets are a separate future spec.

insert into iam.permissions (id, code, description)
values
  ('p_payments_configure', 'payments.configure', 'Configure the tenant payment provider')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and p.code = 'payments.configure'
  and r.code in ('platform_admin', 'tenant_admin')
on conflict (tenant_id, role_id, permission_id) do nothing;

create table if not exists payments.payment_provider_settings (
  tenant_id text primary key,
  provider_code text not null default 'noop',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/migration-0056.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add apps/backend/migrations/0056_payments_provider_settings.sql apps/backend/src/modules/payments/migration-0056.test.ts
git commit -m "feat(payments): migration 0056 — provider settings table + payments.configure"
```

---

## Task 2: Per-tenant provider settings repository + service

**Files:**

- Create: `apps/backend/src/modules/payments/payment-provider-settings.repository.ts`
- Create: `apps/backend/src/modules/payments/in-memory-payment-provider-settings.repository.ts`
- Create: `apps/backend/src/modules/payments/postgres-payment-provider-settings.repository.ts`
- Create: `apps/backend/src/modules/payments/payment-provider-settings.service.ts`
- Test: `apps/backend/src/modules/payments/in-memory-payment-provider-settings.repository.test.ts`
- Test: `apps/backend/src/modules/payments/payment-provider-settings.service.test.ts`

> NOTE: `PaymentProviderCode` is introduced in Task 3. To avoid an ordering dependency, this task types `providerCode` as a plain `string` in the repository interface and the service; Task 3 does not need to change it (the resolver narrows by lookup). The settings layer is provider-code-agnostic by design.

- [x] **Step 1: Write the failing in-memory repo test**

```ts
// apps/backend/src/modules/payments/in-memory-payment-provider-settings.repository.test.ts
import { describe, expect, it } from 'vitest';

import { InMemoryPaymentProviderSettingsRepository } from './in-memory-payment-provider-settings.repository.js';

describe('InMemoryPaymentProviderSettingsRepository', () => {
  it('returns null for an unknown tenant', async () => {
    const repo = new InMemoryPaymentProviderSettingsRepository();
    expect(await repo.get('t-none')).toBeNull();
  });
  it('upserts and reads back', async () => {
    const repo = new InMemoryPaymentProviderSettingsRepository();
    const saved = await repo.upsert('t1', { providerCode: 'yookassa', enabled: true });
    expect(saved.tenantId).toBe('t1');
    expect(saved.providerCode).toBe('yookassa');
    expect(saved.enabled).toBe(true);
    const got = await repo.get('t1');
    expect(got?.providerCode).toBe('yookassa');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/in-memory-payment-provider-settings.repository.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [x] **Step 3: Write the interface + in-memory + postgres repos**

```ts
// apps/backend/src/modules/payments/payment-provider-settings.repository.ts
export const PAYMENT_PROVIDER_SETTINGS_REPOSITORY = Symbol('PAYMENT_PROVIDER_SETTINGS_REPOSITORY');

export interface PaymentProviderSettings {
  tenantId: string;
  providerCode: string;
  enabled: boolean;
  updatedAt: string;
}

export interface PaymentProviderSettingsInput {
  providerCode: string;
  enabled: boolean;
}

export interface PaymentProviderSettingsRepository {
  get(tenantId: string): Promise<PaymentProviderSettings | null>;
  upsert(tenantId: string, input: PaymentProviderSettingsInput): Promise<PaymentProviderSettings>;
}
```

```ts
// apps/backend/src/modules/payments/in-memory-payment-provider-settings.repository.ts
import { Injectable } from '@nestjs/common';

import type {
  PaymentProviderSettings,
  PaymentProviderSettingsInput,
  PaymentProviderSettingsRepository
} from './payment-provider-settings.repository.js';

@Injectable()
export class InMemoryPaymentProviderSettingsRepository implements PaymentProviderSettingsRepository {
  private readonly rows = new Map<string, PaymentProviderSettings>();

  async get(tenantId: string): Promise<PaymentProviderSettings | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async upsert(
    tenantId: string,
    input: PaymentProviderSettingsInput
  ): Promise<PaymentProviderSettings> {
    const row: PaymentProviderSettings = {
      tenantId,
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedAt: new Date().toISOString()
    };
    this.rows.set(tenantId, row);
    return row;
  }
}
```

```ts
// apps/backend/src/modules/payments/postgres-payment-provider-settings.repository.ts
import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type {
  PaymentProviderSettings,
  PaymentProviderSettingsInput,
  PaymentProviderSettingsRepository
} from './payment-provider-settings.repository.js';

@Injectable()
export class PostgresPaymentProviderSettingsRepository implements PaymentProviderSettingsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async get(tenantId: string): Promise<PaymentProviderSettings | null> {
    const rows = await this.db.query<{
      tenant_id: string;
      provider_code: string;
      enabled: boolean;
      updated_at: string;
    }>(
      `select tenant_id, provider_code, enabled, updated_at
       from payments.payment_provider_settings where tenant_id = $1`,
      [tenantId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      providerCode: row.provider_code,
      enabled: row.enabled,
      updatedAt: row.updated_at
    };
  }

  async upsert(
    tenantId: string,
    input: PaymentProviderSettingsInput
  ): Promise<PaymentProviderSettings> {
    const updatedAt = new Date().toISOString();
    await this.db.query(
      `insert into payments.payment_provider_settings
         (tenant_id, provider_code, enabled, updated_at)
       values ($1, $2, $3, $4::timestamptz)
       on conflict (tenant_id) do update set
         provider_code = excluded.provider_code,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      [tenantId, input.providerCode, input.enabled, updatedAt]
    );
    return { tenantId, providerCode: input.providerCode, enabled: input.enabled, updatedAt };
  }
}
```

- [x] **Step 4: Run in-memory repo test — PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/in-memory-payment-provider-settings.repository.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [x] **Step 5: Write the failing service test**

```ts
// apps/backend/src/modules/payments/payment-provider-settings.service.test.ts
import { describe, expect, it } from 'vitest';

import { InMemoryPaymentProviderSettingsRepository } from './in-memory-payment-provider-settings.repository.js';
import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';

describe('PaymentProviderSettingsService', () => {
  it('returns a safe default (noop, disabled) when no row', async () => {
    const svc = new PaymentProviderSettingsService(new InMemoryPaymentProviderSettingsRepository());
    const cfg = await svc.get('t1');
    expect(cfg.providerCode).toBe('noop');
    expect(cfg.enabled).toBe(false);
  });
  it('round-trips a saved provider', async () => {
    const svc = new PaymentProviderSettingsService(new InMemoryPaymentProviderSettingsRepository());
    await svc.save('t1', { providerCode: 'tinkoff', enabled: true });
    const cfg = await svc.get('t1');
    expect(cfg.providerCode).toBe('tinkoff');
    expect(cfg.enabled).toBe(true);
  });
});
```

- [x] **Step 6: Run it (FAIL), write the service, run again (PASS)**

```ts
// apps/backend/src/modules/payments/payment-provider-settings.service.ts
import { Inject, Injectable } from '@nestjs/common';

import {
  PAYMENT_PROVIDER_SETTINGS_REPOSITORY,
  type PaymentProviderSettings,
  type PaymentProviderSettingsInput,
  type PaymentProviderSettingsRepository
} from './payment-provider-settings.repository.js';

@Injectable()
export class PaymentProviderSettingsService {
  constructor(
    @Inject(PAYMENT_PROVIDER_SETTINGS_REPOSITORY)
    private readonly repo: PaymentProviderSettingsRepository
  ) {}

  async get(tenantId: string): Promise<PaymentProviderSettings> {
    const saved = await this.repo.get(tenantId);
    if (saved) return saved;
    return { tenantId, providerCode: 'noop', enabled: false, updatedAt: new Date(0).toISOString() };
  }

  async save(
    tenantId: string,
    input: PaymentProviderSettingsInput
  ): Promise<PaymentProviderSettings> {
    return this.repo.upsert(tenantId, input);
  }
}
```

Run both: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/in-memory-payment-provider-settings.repository.test.ts src/modules/payments/payment-provider-settings.service.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/payments/*payment-provider-settings*
git commit -m "feat(payments): per-tenant provider settings repository + service"
```

---

## Task 3: Seam → registry refactor + per-tenant resolver + call-site migration

This task is a cohesive refactor: it converts the single-token seam to a registry, adds the resolver, and migrates every call site. The tree must be green at the end (typecheck + payments tests).

**Files:**

- Modify: `apps/backend/src/infrastructure/payments/payment.provider.ts`
- Modify: `apps/backend/src/infrastructure/payments/fake-payment.provider.ts`
- Modify: `apps/backend/src/infrastructure/payments/fake-payment.provider.test.ts`
- Modify: `apps/backend/src/infrastructure/payments/noop-payment.provider.test.ts`
- Create: `apps/backend/src/modules/payments/payment-provider-resolver.service.ts`
- Test: `apps/backend/src/modules/payments/payment-provider-resolver.service.test.ts`
- Modify: `apps/backend/src/modules/payments/payments.types.ts`
- Modify: `apps/backend/src/modules/payments/payments.service.ts`
- Modify: `apps/backend/src/modules/payments/payments-webhook.controller.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`
- Modify: `apps/backend/src/modules/payments/payments.http.integration.test.ts`

- [x] **Step 1: Write the failing resolver test**

```ts
// apps/backend/src/modules/payments/payment-provider-resolver.service.test.ts
import { describe, expect, it } from 'vitest';

import { InMemoryPaymentProviderSettingsRepository } from './in-memory-payment-provider-settings.repository.js';
import { PaymentProviderResolver } from './payment-provider-resolver.service.js';
import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';
import {
  NoopPaymentProvider,
  type PaymentProvider,
  type PaymentProviderRegistry
} from '../../infrastructure/payments/payment.provider.js';

class StubProvider implements PaymentProvider {
  constructor(readonly code: any) {}
  async createPayment() {
    return { providerPaymentId: 'p', status: 'pending' as const };
  }
  async parseWebhook() {
    return null;
  }
}

function makeResolver(opts: {
  enabled: boolean;
  nodeEnv?: string;
  settings?: PaymentProviderSettingsService;
}) {
  const registry: PaymentProviderRegistry = new Map([
    ['noop', new NoopPaymentProvider()],
    ['yookassa', new StubProvider('yookassa')],
    ['fake', new StubProvider('fake')]
  ]);
  const settings =
    opts.settings ??
    new PaymentProviderSettingsService(new InMemoryPaymentProviderSettingsRepository());
  return {
    resolver: new PaymentProviderResolver(registry, settings, opts.enabled, opts.nodeEnv ?? 'test'),
    settings
  };
}

describe('PaymentProviderResolver', () => {
  it('returns Noop when the subsystem is disabled', async () => {
    const { resolver } = makeResolver({ enabled: false });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
  it('returns Noop when the tenant has no settings', async () => {
    const { resolver } = makeResolver({ enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
  it('returns the tenant-selected provider when enabled', async () => {
    const { resolver, settings } = makeResolver({ enabled: true });
    await settings.save('t1', { providerCode: 'yookassa', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('yookassa');
  });
  it('forces Noop for fake in production', async () => {
    const { resolver, settings } = makeResolver({ enabled: true, nodeEnv: 'production' });
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
  it('falls back to Noop for an unknown/unregistered code', async () => {
    const { resolver, settings } = makeResolver({ enabled: true });
    await settings.save('t1', { providerCode: 'tinkoff', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payment-provider-resolver.service.test.ts --no-file-parallelism`
Expected: FAIL — `payment.provider.js` has no `PaymentProviderRegistry`; resolver module missing.

- [x] **Step 3: Refactor the seam (`payment.provider.ts`)**

Replace the file with:

```ts
// apps/backend/src/infrastructure/payments/payment.provider.ts
/**
 * Provider-agnostic, MULTI-PROVIDER seam for course-purchase payments. The active provider is
 * chosen PER TENANT (see PaymentProviderResolver), not by one global env enum — mirroring the
 * webinar seam. Noop is the safe default while PAYMENTS_ENABLED=false and for any tenant with no
 * provider configured. Real adapters (ЮKassa, Tinkoff, CloudPayments, Robokassa) register into the
 * registry. All amounts are integer kopecks; major-unit conversion happens only inside an adapter.
 */
export type PaymentProviderCode =
  | 'noop'
  | 'fake'
  | 'yookassa'
  | 'tinkoff'
  | 'cloudpayments'
  | 'robokassa';

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
  /** Stable provider code; also stored in the payments.provider column. */
  readonly code: PaymentProviderCode;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  /** Verifies authenticity internally; returns null for unrecognized/unverified payloads. */
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null>;
  /**
   * Optional provider-specific webhook ACK body. The acquirer retries unless it receives the body
   * it expects (Robokassa `OK{InvId}`, Tinkoff `OK`, CloudPayments `{code:0}`, ЮKassa any-200).
   * When omitted, the controller responds `{ ok: true }`.
   */
  webhookAck?(event: WebhookEvent | null, raw: Buffer): string | Record<string, unknown>;
}

/** DI token for the registry of all compiled-in providers. Mirrors WEBINAR_PROVIDER_REGISTRY. */
export const PAYMENT_PROVIDER_REGISTRY = Symbol('PAYMENT_PROVIDER_REGISTRY');
export type PaymentProviderRegistry = Map<PaymentProviderCode, PaymentProvider>;

export class NoopPaymentProvider implements PaymentProvider {
  readonly code = 'noop' as const;
  async createPayment(_params: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { providerPaymentId: '', status: 'disabled' };
  }
  async parseWebhook(): Promise<WebhookEvent | null> {
    return null;
  }
}
```

- [x] **Step 4: Update Fake provider + its tests + noop test (`id`→`code`)**

In `fake-payment.provider.ts`: change `readonly id = 'fake';` to `readonly code = 'fake' as const;`.
In `fake-payment.provider.test.ts`: change `expect(provider.id).toBe('fake')` to `expect(provider.code).toBe('fake')`.
In `noop-payment.provider.test.ts`: change any `.id` assertion to `.code` (read the file; replace `provider.id` → `provider.code`, expected value `'noop'`).

- [x] **Step 5: Write the resolver (`payment-provider-resolver.service.ts`)**

```ts
// apps/backend/src/modules/payments/payment-provider-resolver.service.ts
import { Inject, Injectable } from '@nestjs/common';

import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';
import { backendEnv } from '../../env.js';
import {
  NoopPaymentProvider,
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProvider,
  type PaymentProviderCode,
  type PaymentProviderRegistry
} from '../../infrastructure/payments/payment.provider.js';

/**
 * Resolves the active PaymentProvider FOR A TENANT. The prod-guard for `fake` lives here (env no
 * longer names the active provider — it is per-tenant). Mirrors WebinarProviderResolver.
 */
@Injectable()
export class PaymentProviderResolver {
  private readonly noop = new NoopPaymentProvider();

  constructor(
    @Inject(PAYMENT_PROVIDER_REGISTRY) private readonly registry: PaymentProviderRegistry,
    @Inject(PaymentProviderSettingsService)
    private readonly settings: PaymentProviderSettingsService,
    private readonly enabledGlobally: boolean = backendEnv.PAYMENTS_ENABLED,
    private readonly nodeEnv: string = backendEnv.NODE_ENV
  ) {}

  async forTenant(tenantId: string): Promise<PaymentProvider> {
    if (!this.enabledGlobally) return this.noop;
    const cfg = await this.settings.get(tenantId);
    if (!cfg.enabled || cfg.providerCode === 'noop') return this.noop;
    if (cfg.providerCode === 'fake' && this.nodeEnv === 'production') {
      console.warn(
        `[payments] tenant ${tenantId} has provider=fake in production — forcing Noop (fake is staging-only)`
      );
      return this.noop;
    }
    return this.registry.get(cfg.providerCode as PaymentProviderCode) ?? this.noop;
  }

  /** Used by the unguarded webhook (no tenant): the env-credentialed registry singleton. */
  fromRegistry(code: string): PaymentProvider | undefined {
    if (code === 'fake' && this.nodeEnv === 'production') return undefined;
    return this.registry.get(code as PaymentProviderCode);
  }
}
```

- [x] **Step 6: Extend `PaymentProviderId` (`payments.types.ts`)**

Change line 5 to:

```ts
export type PaymentProviderId =
  | 'manual'
  | 'noop'
  | 'fake'
  | 'yookassa'
  | 'tinkoff'
  | 'cloudpayments'
  | 'robokassa';
```

- [x] **Step 7: Migrate `PaymentsService.pay()` to the resolver**

In `payments.service.ts`:

- Replace the import block for the provider with:
  ```ts
  import { PaymentProviderResolver } from './payment-provider-resolver.service.js';
  ```
  and remove the `PAYMENT_PROVIDER` / `PaymentProvider` import.
- Replace the constructor param `@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,` with:
  ```ts
  @Inject(PaymentProviderResolver) private readonly resolver: PaymentProviderResolver,
  ```
- In `pay()`, before `const result = await this.provider.createPayment({`, insert:

  ```ts
  const provider = await this.resolver.forTenant(tenantId);
  ```

  then change `this.provider.createPayment(` → `provider.createPayment(` and
  `provider: this.provider.id as any,` → `provider: provider.code,`.

- [x] **Step 8: Migrate the webhook controller to a provider-specific path**

Replace `payments-webhook.controller.ts` with:

```ts
import { Controller, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PaymentProviderResolver } from './payment-provider-resolver.service.js';
import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';

import type { Request } from 'express';

/**
 * Unguarded payment webhook. The acquirer carries no JWT / x-tenant-id and POSTs to a public,
 * provider-specific URL: /payments/webhook/:providerCode. We pick the env-credentialed registry
 * instance for that code (creds are global → no tenant needed to parse), then resolve the order
 * by provider_payment_id → tenant. Authenticity is the adapter's signature/re-fetch check.
 */
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    @Inject(PaymentProviderResolver) private readonly resolver: PaymentProviderResolver,
    @Inject(PAYMENTS_REPOSITORY) private readonly repo: PaymentsRepository,
    @Inject(PaymentFulfillmentService) private readonly fulfillment: PaymentFulfillmentService
  ) {}

  @Post('webhook/:providerCode')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(
    @Param('providerCode') providerCode: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>
  ) {
    const provider = this.resolver.fromRegistry(providerCode);
    if (!provider) return { ok: true };
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const event = await provider.parseWebhook(raw, headers);
    const ack = () => provider.webhookAck?.(event, raw) ?? { ok: true };
    if (!event) return ack();
    const found = await this.repo.findOrderByProviderPaymentId(event.providerPaymentId);
    if (!found) return ack();
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
    return ack();
  }
}
```

- [x] **Step 9: Rewire the module (`payments.module.ts`)**

Replace the provider/factory block. New providers list (keep `PAYMENTS_REPOSITORY` factory as-is; add settings repo factory; replace the `PAYMENT_PROVIDER` factory with the registry; add resolver + settings service):

```ts
import { InMemoryPaymentProviderSettingsRepository } from './in-memory-payment-provider-settings.repository.js';
import { PaymentProviderResolver } from './payment-provider-resolver.service.js';
import { PAYMENT_PROVIDER_SETTINGS_REPOSITORY } from './payment-provider-settings.repository.js';
import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';
import { PostgresPaymentProviderSettingsRepository } from './postgres-payment-provider-settings.repository.js';
import { FakePaymentProvider } from '../../infrastructure/payments/fake-payment.provider.js';
import {
  NoopPaymentProvider,
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProviderCode,
  type PaymentProvider,
  type PaymentProviderRegistry
} from '../../infrastructure/payments/payment.provider.js';
```

Providers array — remove the old `PAYMENT_PROVIDER` factory and add:

```ts
{
  provide: PAYMENT_PROVIDER_SETTINGS_REPOSITORY,
  useFactory: (db: DatabaseService) =>
    backendEnv.ALLOW_IN_MEMORY_STATE
      ? new InMemoryPaymentProviderSettingsRepository()
      : new PostgresPaymentProviderSettingsRepository(db),
  inject: [DatabaseService]
},
PaymentProviderSettingsService,
{
  // Phase 7 multi-provider registry. Real adapters are added in Tasks 5-8 (credential-gated).
  provide: PAYMENT_PROVIDER_REGISTRY,
  useFactory: (): PaymentProviderRegistry =>
    new Map<PaymentProviderCode, PaymentProvider>([
      ['noop', new NoopPaymentProvider()],
      ['fake', new FakePaymentProvider()]
    ])
},
PaymentProviderResolver,
```

- [x] **Step 10: Update `payments.http.integration.test.ts`**

Read the file. Wherever it provides `PAYMENT_PROVIDER` (single token) to the test module, replace it with providing `PAYMENT_PROVIDER_REGISTRY` (a `Map` with `noop`), `PaymentProviderSettingsService` (backed by `InMemoryPaymentProviderSettingsRepository`), and `PaymentProviderResolver`. If the test posts to `/payments/webhook`, change the path to `/payments/webhook/fake` (and register a `fake` entry in the test registry) so the provider-specific route resolves. Keep all permission-boundary assertions unchanged.

- [x] **Step 11: Run the payments suite + typecheck**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments src/infrastructure/payments --no-file-parallelism`
Expected: PASS (resolver 5, settings 4, fake/noop provider, service, fulfillment, dto, http integration, migration).
Run: `pnpm typecheck`
Expected: 8/8.

- [x] **Step 12: Commit**

```bash
git add apps/backend/src/infrastructure/payments apps/backend/src/modules/payments
git commit -m "refactor(payments): registry + per-tenant resolver; provider-specific webhook path"
```

---

## Task 4: env schema (remove `PAYMENTS_PROVIDER`, add acquirer creds) + rawBody

**Files:**

- Modify: `apps/backend/src/env.schema.ts`
- Modify: `apps/backend/src/env.payments.test.ts`
- Modify: `apps/backend/src/main.ts`
- Modify: `infra/.env.production.example`

- [x] **Step 1: Rewrite `env.payments.test.ts` expectations**

Replace the `describe('PAYMENTS_* env', ...)` block with:

```ts
describe('PAYMENTS_* env', () => {
  it('defaults to disabled + RUB; PAYMENTS_PROVIDER no longer exists', () => {
    const env = backendEnvSchema.parse({ ...devBase });
    expect(env.PAYMENTS_ENABLED).toBe(false);
    expect(env.PAYMENTS_CURRENCY).toBe('RUB');
    expect('PAYMENTS_PROVIDER' in env).toBe(false);
  });

  it('never coerces the string "false" to true', () => {
    const env = backendEnvSchema.parse({ ...devBase, PAYMENTS_ENABLED: 'false' });
    expect(env.PAYMENTS_ENABLED).toBe(false);
  });

  it('parses ЮKassa credentials when provided', () => {
    const env = backendEnvSchema.parse({
      ...devBase,
      PAYMENTS_ENABLED: 'true',
      YOOKASSA_SHOP_ID: 'shop-1',
      YOOKASSA_SECRET_KEY: 'sk-live-xxx',
      YOOKASSA_RETURN_URL: 'https://lms.example.ru/payments/return'
    });
    expect(env.YOOKASSA_SHOP_ID).toBe('shop-1');
    expect(env.YOOKASSA_API_BASE).toBe('https://api.yookassa.ru/v3');
    expect(env.YOOKASSA_WEBHOOK_IP_CHECK).toBe(true);
  });

  it('parses with no acquirer creds even when enabled (adapters are credential-gated at runtime)', () => {
    const parsed = backendEnvSchema.safeParse({
      ...strictBase,
      NODE_ENV: 'production',
      DEPLOYMENT_PROFILE: 'prod',
      PAYMENTS_ENABLED: 'true'
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.payments.test.ts --no-file-parallelism`
Expected: FAIL — `PAYMENTS_PROVIDER` still in schema; `YOOKASSA_*` undefined.

- [x] **Step 3: Edit `env.schema.ts`**

- Remove the `PAYMENTS_PROVIDER` line (the `z.enum(['noop', 'yookassa', 'fake'])` one).
- Remove the prod-guard refinement block that references `env.PAYMENTS_PROVIDER === 'fake'` (lines ~409-419).
- After `PAYMENTS_CURRENCY`, add the acquirer vars:

```ts
    // --- Acquirer credentials (one platform merchant). All optional; an adapter with blank
    // creds is omitted from the registry at runtime (boot never fails for a missing acquirer). ---
    YOOKASSA_SHOP_ID: z.string().default(''),
    YOOKASSA_SECRET_KEY: z.string().default(''),
    YOOKASSA_RETURN_URL: z.string().default(''),
    YOOKASSA_API_BASE: z.string().default('https://api.yookassa.ru/v3'),
    YOOKASSA_WEBHOOK_IPS: z
      .string()
      .default(
        '185.71.76.0/27,185.71.77.0/27,77.75.153.0/25,77.75.156.11,77.75.156.35,77.75.154.128/25,2a02:5180::/32'
      ),
    YOOKASSA_WEBHOOK_IP_CHECK: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(true),
    TINKOFF_TERMINAL_KEY: z.string().default(''),
    TINKOFF_PASSWORD: z.string().default(''),
    TINKOFF_API_BASE: z.string().default('https://securepay.tinkoff.ru'),
    TINKOFF_SUCCESS_URL: z.string().default(''),
    CLOUDPAYMENTS_PUBLIC_ID: z.string().default(''),
    CLOUDPAYMENTS_API_SECRET: z.string().default(''),
    CLOUDPAYMENTS_API_BASE: z.string().default('https://api.cloudpayments.ru'),
    ROBOKASSA_MERCHANT_LOGIN: z.string().default(''),
    ROBOKASSA_PASSWORD_1: z.string().default(''),
    ROBOKASSA_PASSWORD_2: z.string().default(''),
    ROBOKASSA_PAY_URL: z.string().default('https://auth.robokassa.ru/Merchant/Index.aspx'),
```

- [x] **Step 4: Run env test — PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.payments.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [x] **Step 5: Enable rawBody in `main.ts`**

Change:

```ts
const app = await NestFactory.create(AppModule, {
  cors: { origin: backendEnv.CORS_ORIGIN, credentials: true }
});
```

to:

```ts
const app = await NestFactory.create(AppModule, {
  rawBody: true,
  cors: { origin: backendEnv.CORS_ORIGIN, credentials: true }
});
```

- [x] **Step 6: Update `infra/.env.production.example`**

Read the file; find the `PAYMENTS_*` block. Remove `PAYMENTS_PROVIDER=...`. Keep `PAYMENTS_ENABLED=false` and `PAYMENTS_CURRENCY=RUB`. Add commented placeholders below it:

```bash
# Acquirer credentials (fill the ones you use; blank adapters are skipped). Activate with PAYMENTS_ENABLED=true
# and the tenant selecting a provider in /admin/payments/settings.
# YOOKASSA_SHOP_ID=
# YOOKASSA_SECRET_KEY=
# YOOKASSA_RETURN_URL=https://your-domain/payments/return
# TINKOFF_TERMINAL_KEY=
# TINKOFF_PASSWORD=
# TINKOFF_SUCCESS_URL=https://your-domain/payments/return
# CLOUDPAYMENTS_PUBLIC_ID=
# CLOUDPAYMENTS_API_SECRET=
# ROBOKASSA_MERCHANT_LOGIN=
# ROBOKASSA_PASSWORD_1=
# ROBOKASSA_PASSWORD_2=
```

- [x] **Step 7: Run the deploy-readiness env guard**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.payments.test.ts --no-file-parallelism` and the prod-env example guard test (find it: `grep -rl "env.production.example" apps/backend/src`). Run that file too.
Expected: PASS. If the guard fails, the example has a key the schema rejects or vice versa — reconcile.

- [x] **Step 8: Commit**

```bash
git add apps/backend/src/env.schema.ts apps/backend/src/env.payments.test.ts apps/backend/src/main.ts infra/.env.production.example
git commit -m "feat(payments): env acquirer creds + rawBody; drop PAYMENTS_PROVIDER (per-tenant now)"
```

---

## Task 5: ЮKassa adapter

> **Verify against current ЮKassa docs during implementation:** request/response field names (`amount.value`, `confirmation.confirmation_url`, notification `event`/`object.status`) and the published webhook IP ranges. The structure below matches the API as specified; adjust field access if the live schema differs.

**Files:**

- Create: `apps/backend/src/infrastructure/payments/yookassa-payment.provider.ts`
- Test: `apps/backend/src/infrastructure/payments/yookassa-payment.provider.test.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts` (register, credential-gated)

- [x] **Step 1: Write the failing test**

```ts
// apps/backend/src/infrastructure/payments/yookassa-payment.provider.test.ts
import { describe, expect, it, vi } from 'vitest';

import { YookassaPaymentProvider } from './yookassa-payment.provider.js';

const cfg = {
  shopId: 'shop-1',
  secretKey: 'sk-test',
  returnUrl: 'https://lms.example.ru/return',
  apiBase: 'https://api.yookassa.ru/v3',
  allowedIps: ['185.71.76.0/27'],
  ipCheckEnabled: false
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

describe('YookassaPaymentProvider.createPayment', () => {
  it('POSTs amount in rubles, Basic auth + Idempotence-Key, returns confirmationUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'yk-1',
        status: 'pending',
        confirmation: { confirmation_url: 'https://pay/yk-1' }
      })
    );
    const p = new YookassaPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    const res = await p.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс'
    });
    expect(res).toEqual({
      providerPaymentId: 'yk-1',
      status: 'pending',
      confirmationUrl: 'https://pay/yk-1'
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.yookassa.ru/v3/payments');
    expect((init as any).headers['Idempotence-Key']).toBe('o1');
    expect((init as any).headers.Authorization).toBe(
      'Basic ' + Buffer.from('shop-1:sk-test').toString('base64')
    );
    const body = JSON.parse((init as any).body);
    expect(body.amount).toEqual({ value: '1500.00', currency: 'RUB' });
    expect(body.confirmation.return_url).toBe(cfg.returnUrl);
  });

  it('throws on a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ type: 'error' }, false, 400));
    const p = new YookassaPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    await expect(
      p.createPayment({
        tenantId: 't1',
        orderId: 'o1',
        amount: 100,
        currency: 'RUB',
        description: 'x'
      })
    ).rejects.toThrow();
  });
});

describe('YookassaPaymentProvider.parseWebhook', () => {
  const notif = (id: string) =>
    Buffer.from(
      JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id } })
    );

  it('re-fetches the payment and trusts the API status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'yk-1', status: 'succeeded' }));
    const p = new YookassaPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    const ev = await p.parseWebhook(notif('yk-1'), {});
    expect(ev).toMatchObject({ providerPaymentId: 'yk-1', status: 'succeeded' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.yookassa.ru/v3/payments/yk-1');
  });

  it('returns null when the API says the payment is still pending (spoofed body)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'yk-1', status: 'pending' }));
    const p = new YookassaPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    expect(await p.parseWebhook(notif('yk-1'), {})).toBeNull();
  });

  it('returns null for an unknown event', async () => {
    const p = new YookassaPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(
      await p.parseWebhook(
        Buffer.from(JSON.stringify({ type: 'notification', event: 'x', object: { id: 'a' } })),
        {}
      )
    ).toBeNull();
  });

  it('drops a notification from a non-allowlisted IP when IP check is on', async () => {
    const fetchMock = vi.fn();
    const p = new YookassaPaymentProvider(
      { ...cfg, ipCheckEnabled: true },
      fetchMock as unknown as typeof fetch
    );
    expect(await p.parseWebhook(notif('yk-1'), { 'x-forwarded-for': '8.8.8.8' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/yookassa-payment.provider.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [x] **Step 3: Write the adapter**

```ts
// apps/backend/src/infrastructure/payments/yookassa-payment.provider.ts
import { isIP } from 'node:net';

import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

export interface YookassaConfig {
  shopId: string;
  secretKey: string;
  returnUrl: string;
  apiBase: string;
  allowedIps: string[];
  ipCheckEnabled: boolean;
}

/** Integer kopecks → "1500.00". */
function kopecksToRubles(kopecks: number): string {
  return (kopecks / 100).toFixed(2);
}

export class YookassaPaymentProvider implements PaymentProvider {
  readonly code = 'yookassa' as const;

  constructor(
    private readonly cfg: YookassaConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.cfg.shopId}:${this.cfg.secretKey}`).toString('base64');
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const res = await this.fetchImpl(`${this.cfg.apiBase}/payments`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Idempotence-Key': params.orderId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { value: kopecksToRubles(params.amount), currency: params.currency },
        capture: true,
        confirmation: { type: 'redirect', return_url: this.cfg.returnUrl },
        description: params.description,
        metadata: { orderId: params.orderId, tenantId: params.tenantId }
      })
    });
    if (!res.ok) {
      throw new Error(`yookassa createPayment failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      id: string;
      confirmation?: { confirmation_url?: string };
    };
    return {
      providerPaymentId: body.id,
      status: 'pending',
      ...(body.confirmation?.confirmation_url
        ? { confirmationUrl: body.confirmation.confirmation_url }
        : {})
    };
  }

  async parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null> {
    let body: { type?: string; event?: string; object?: { id?: string } };
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
    const known = ['payment.succeeded', 'payment.canceled', 'refund.succeeded'];
    if (body.type !== 'notification' || !body.event || !known.includes(body.event)) return null;
    const id = body.object?.id;
    if (typeof id !== 'string') return null;

    if (this.cfg.ipCheckEnabled) {
      const ip = this.clientIp(headers);
      if (ip && !this.ipAllowed(ip)) return null; // fail-open if ip indeterminable
    }

    // Re-fetch: trust the authenticated API response, not the notification body.
    const res = await this.fetchImpl(`${this.cfg.apiBase}/payments/${id}`, {
      headers: { Authorization: this.authHeader() }
    });
    if (!res.ok) return null;
    const payment = (await res.json()) as { id: string; status: string };
    const status =
      payment.status === 'succeeded'
        ? ('succeeded' as const)
        : payment.status === 'canceled'
          ? ('cancelled' as const)
          : null;
    if (!status) return null;
    return { providerPaymentId: payment.id, status, rawPayload: body as Record<string, unknown> };
  }

  private clientIp(headers: Record<string, string | undefined>): string | null {
    const xff = headers['x-forwarded-for'];
    if (!xff) return null;
    const first = xff.split(',')[0]?.trim();
    return first && isIP(first) ? first : null;
  }

  /** Minimal allowlist check: exact match or a /N CIDR over IPv4. Non-IPv4 CIDRs match by prefix string. */
  private ipAllowed(ip: string): boolean {
    return this.cfg.allowedIps.some((entry) => {
      if (!entry.includes('/')) return entry === ip;
      const [base, bitsRaw] = entry.split('/');
      const bits = Number(bitsRaw);
      if (isIP(base) === 4 && isIP(ip) === 4) {
        const toInt = (a: string) =>
          a.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (toInt(ip) & mask) === (toInt(base) & mask);
      }
      return false; // IPv6 CIDR: skip (re-fetch is the real gate)
    });
  }
}
```

- [x] **Step 4: Run the test — PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/yookassa-payment.provider.test.ts --no-file-parallelism`
Expected: PASS (6 tests).

- [x] **Step 5: Register in the module (credential-gated)**

In `payments.module.ts`, import `YookassaPaymentProvider`, and inside the `PAYMENT_PROVIDER_REGISTRY` factory, after seeding noop+fake:

```ts
const reg = new Map<PaymentProviderCode, PaymentProvider>([
  ['noop', new NoopPaymentProvider()],
  ['fake', new FakePaymentProvider()]
]);
if (backendEnv.YOOKASSA_SHOP_ID && backendEnv.YOOKASSA_SECRET_KEY) {
  reg.set(
    'yookassa',
    new YookassaPaymentProvider({
      shopId: backendEnv.YOOKASSA_SHOP_ID,
      secretKey: backendEnv.YOOKASSA_SECRET_KEY,
      returnUrl: backendEnv.YOOKASSA_RETURN_URL,
      apiBase: backendEnv.YOOKASSA_API_BASE,
      allowedIps: backendEnv.YOOKASSA_WEBHOOK_IPS.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      ipCheckEnabled: backendEnv.YOOKASSA_WEBHOOK_IP_CHECK
    })
  );
} else if (backendEnv.PAYMENTS_ENABLED) {
  console.warn('[payments] yookassa not registered — YOOKASSA_SHOP_ID/SECRET_KEY missing');
}
return reg;
```

(Convert the factory body from the inline `new Map([...])` to the `const reg = ...; return reg;` form.)

- [x] **Step 6: Run payments suite + typecheck**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments src/infrastructure/payments --no-file-parallelism && pnpm typecheck`
Expected: PASS; 8/8.

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/infrastructure/payments/yookassa-payment.provider.* apps/backend/src/modules/payments/payments.module.ts
git commit -m "feat(payments): ЮKassa adapter (re-fetch + IP-allowlist webhook)"
```

---

## Task 6: Т-Касса (Tinkoff) adapter

> **Verify against current Т-Касса docs:** `/v2/Init` request/response (`Amount` in kopecks, `PaymentId`, `PaymentURL`, `Success`), the token algorithm (SHA-256 over root scalar params + `Password`, sorted by key), notification fields (`Status`, `PaymentId`, `Token`), and the required `OK` ACK.

**Files:**

- Create: `apps/backend/src/infrastructure/payments/tinkoff-payment.provider.ts`
- Test: `apps/backend/src/infrastructure/payments/tinkoff-payment.provider.test.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`

- [x] **Step 1: Write the failing test**

```ts
// apps/backend/src/infrastructure/payments/tinkoff-payment.provider.test.ts
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { TinkoffPaymentProvider, tinkoffToken } from './tinkoff-payment.provider.js';

const cfg = {
  terminalKey: 'TERM1',
  password: 'pw',
  apiBase: 'https://securepay.tinkoff.ru',
  successUrl: 'https://lms.example.ru/return'
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

describe('tinkoffToken', () => {
  it('hashes sorted root scalar values + password', () => {
    const token = tinkoffToken({ TerminalKey: 'TERM1', Amount: 100, OrderId: 'o1' }, 'pw');
    const expected = createHash('sha256')
      .update('100' + 'o1' + 'pw' + 'TERM1') // Amount, OrderId, Password, TerminalKey sorted by key
      .digest('hex');
    expect(token).toBe(expected);
  });
});

describe('TinkoffPaymentProvider.createPayment', () => {
  it('Init with kopeck Amount + token; returns PaymentURL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ Success: true, PaymentId: '900', PaymentURL: 'https://pay/t-900' })
      );
    const p = new TinkoffPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    const res = await p.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс'
    });
    expect(res).toEqual({
      providerPaymentId: '900',
      status: 'pending',
      confirmationUrl: 'https://pay/t-900'
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.Amount).toBe(150000);
    expect(body.OrderId).toBe('o1');
    expect(typeof body.Token).toBe('string');
  });

  it('throws when Success=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ Success: false, Message: 'bad' }));
    const p = new TinkoffPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    await expect(
      p.createPayment({
        tenantId: 't1',
        orderId: 'o1',
        amount: 1,
        currency: 'RUB',
        description: 'x'
      })
    ).rejects.toThrow();
  });
});

describe('TinkoffPaymentProvider.parseWebhook', () => {
  function notif(extra: Record<string, unknown>) {
    const base = { TerminalKey: 'TERM1', PaymentId: '900', Status: 'CONFIRMED', ...extra };
    const token = tinkoffToken(base, 'pw');
    return Buffer.from(JSON.stringify({ ...base, Token: token }));
  }
  it('verifies the token and maps CONFIRMED → succeeded', async () => {
    const p = new TinkoffPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    const ev = await p.parseWebhook(notif({}), {});
    expect(ev).toMatchObject({ providerPaymentId: '900', status: 'succeeded' });
  });
  it('returns null on a bad token', async () => {
    const p = new TinkoffPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    const raw = Buffer.from(
      JSON.stringify({
        TerminalKey: 'TERM1',
        PaymentId: '900',
        Status: 'CONFIRMED',
        Token: 'wrong'
      })
    );
    expect(await p.parseWebhook(raw, {})).toBeNull();
  });
  it('acks with the literal OK', () => {
    const p = new TinkoffPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(p.webhookAck()).toBe('OK');
  });
});
```

- [x] **Step 2: Run (FAIL) → Step 3: write the adapter → Step 4: run (PASS)**

```ts
// apps/backend/src/infrastructure/payments/tinkoff-payment.provider.ts
import { createHash } from 'node:crypto';

import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

export interface TinkoffConfig {
  terminalKey: string;
  password: string;
  apiBase: string;
  successUrl: string;
}

/** SHA-256 over root-level scalar values, sorted by key, with Password folded in. */
export function tinkoffToken(params: Record<string, unknown>, password: string): string {
  const src: Record<string, unknown> = { ...params, Password: password };
  delete src.Token;
  const concat = Object.keys(src)
    .filter((k) => {
      const v = src[k];
      return v !== null && v !== undefined && typeof v !== 'object';
    })
    .sort()
    .map((k) => String(src[k]))
    .join('');
  return createHash('sha256').update(concat).digest('hex');
}

export class TinkoffPaymentProvider implements PaymentProvider {
  readonly code = 'tinkoff' as const;

  constructor(
    private readonly cfg: TinkoffConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const reqBody: Record<string, unknown> = {
      TerminalKey: this.cfg.terminalKey,
      Amount: params.amount, // Tinkoff Amount is kopecks (no conversion)
      OrderId: params.orderId,
      Description: params.description,
      ...(this.cfg.successUrl ? { SuccessURL: this.cfg.successUrl } : {})
    };
    reqBody.Token = tinkoffToken(reqBody, this.cfg.password);
    const res = await this.fetchImpl(`${this.cfg.apiBase}/v2/Init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    const body = (await res.json()) as {
      Success?: boolean;
      PaymentId?: string | number;
      PaymentURL?: string;
      Message?: string;
    };
    if (!res.ok || body.Success !== true || !body.PaymentId) {
      throw new Error(`tinkoff Init failed: ${body.Message ?? res.status}`);
    }
    return {
      providerPaymentId: String(body.PaymentId),
      status: 'pending',
      ...(body.PaymentURL ? { confirmationUrl: body.PaymentURL } : {})
    };
  }

  async parseWebhook(raw: Buffer): Promise<WebhookEvent | null> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
    const token = body.Token;
    if (typeof token !== 'string' || tinkoffToken(body, this.cfg.password) !== token) return null;
    const paymentId = body.PaymentId;
    if (paymentId === undefined || paymentId === null) return null;
    const status =
      body.Status === 'CONFIRMED' || body.Status === 'AUTHORIZED'
        ? ('succeeded' as const)
        : body.Status === 'REJECTED' || body.Status === 'CANCELED'
          ? ('cancelled' as const)
          : null;
    if (!status) return null;
    return { providerPaymentId: String(paymentId), status, rawPayload: body };
  }

  webhookAck(): string {
    return 'OK';
  }
}
```

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/tinkoff-payment.provider.test.ts --no-file-parallelism`
Expected: PASS (6 tests).

- [x] **Step 5: Register (credential-gated) in `payments.module.ts`**

```ts
if (backendEnv.TINKOFF_TERMINAL_KEY && backendEnv.TINKOFF_PASSWORD) {
  reg.set(
    'tinkoff',
    new TinkoffPaymentProvider({
      terminalKey: backendEnv.TINKOFF_TERMINAL_KEY,
      password: backendEnv.TINKOFF_PASSWORD,
      apiBase: backendEnv.TINKOFF_API_BASE,
      successUrl: backendEnv.TINKOFF_SUCCESS_URL
    })
  );
}
```

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/infrastructure/payments/tinkoff-payment.provider.* apps/backend/src/modules/payments/payments.module.ts
git commit -m "feat(payments): Т-Касса (Tinkoff) adapter (token-signed Init + webhook)"
```

---

## Task 7: CloudPayments adapter

> **Verify against current CloudPayments docs:** `/orders/create` request/response (`Amount` major units, `Model.Id`, `Model.Url`, `Success`), the webhook HMAC header name (`Content-HMAC`) and base64(HMAC-SHA256(rawBody, apiSecret)) scheme, notification status fields, and the `{ code: 0 }` ACK.

**Files:**

- Create: `apps/backend/src/infrastructure/payments/cloudpayments-payment.provider.ts`
- Test: `apps/backend/src/infrastructure/payments/cloudpayments-payment.provider.test.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`

- [x] **Step 1: Write the failing test**

```ts
// apps/backend/src/infrastructure/payments/cloudpayments-payment.provider.test.ts
import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { CloudPaymentsProvider } from './cloudpayments-payment.provider.js';

const cfg = { publicId: 'pid', apiSecret: 'secret', apiBase: 'https://api.cloudpayments.ru' };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

describe('CloudPaymentsProvider.createPayment', () => {
  it('creates an order with major-unit amount + Basic auth; returns Model.Url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ Success: true, Model: { Id: 'cp-1', Url: 'https://pay/cp-1' } })
      );
    const p = new CloudPaymentsProvider(cfg, fetchMock as unknown as typeof fetch);
    const res = await p.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс'
    });
    expect(res).toEqual({
      providerPaymentId: 'cp-1',
      status: 'pending',
      confirmationUrl: 'https://pay/cp-1'
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudpayments.ru/orders/create');
    expect((init as any).headers.Authorization).toBe(
      'Basic ' + Buffer.from('pid:secret').toString('base64')
    );
    const body = JSON.parse((init as any).body);
    expect(body.Amount).toBe(1500);
  });
});

describe('CloudPaymentsProvider.parseWebhook', () => {
  const payload = { TransactionId: 555, Status: 'Completed' };
  const raw = Buffer.from(JSON.stringify(payload));
  const goodHmac = createHmac('sha256', cfg.apiSecret).update(raw).digest('base64');

  it('verifies Content-HMAC and maps Completed → succeeded', async () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    const ev = await p.parseWebhook(raw, { 'content-hmac': goodHmac });
    expect(ev).toMatchObject({ providerPaymentId: '555', status: 'succeeded' });
  });
  it('returns null on a bad HMAC', async () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(await p.parseWebhook(raw, { 'content-hmac': 'nope' })).toBeNull();
  });
  it('acks with {code:0}', () => {
    const p = new CloudPaymentsProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(p.webhookAck()).toEqual({ code: 0 });
  });
});
```

- [x] **Step 2: Run (FAIL) → Step 3: write the adapter → Step 4: run (PASS)**

```ts
// apps/backend/src/infrastructure/payments/cloudpayments-payment.provider.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

export interface CloudPaymentsConfig {
  publicId: string;
  apiSecret: string;
  apiBase: string;
}

export class CloudPaymentsProvider implements PaymentProvider {
  readonly code = 'cloudpayments' as const;

  constructor(
    private readonly cfg: CloudPaymentsConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.cfg.publicId}:${this.cfg.apiSecret}`).toString('base64');
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const res = await this.fetchImpl(`${this.cfg.apiBase}/orders/create`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Amount: params.amount / 100, // CloudPayments Amount is major units
        Currency: params.currency,
        Description: params.description,
        JsonData: { orderId: params.orderId, tenantId: params.tenantId }
      })
    });
    const body = (await res.json()) as {
      Success?: boolean;
      Model?: { Id?: string; Number?: string; Url?: string };
      Message?: string;
    };
    if (!res.ok || body.Success !== true || !body.Model?.Id) {
      throw new Error(`cloudpayments order failed: ${body.Message ?? res.status}`);
    }
    return {
      providerPaymentId: String(body.Model.Id),
      status: 'pending',
      ...(body.Model.Url ? { confirmationUrl: body.Model.Url } : {})
    };
  }

  async parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null> {
    const provided = headers['content-hmac'] ?? headers['x-content-hmac'];
    if (!provided) return null;
    const expected = createHmac('sha256', this.cfg.apiSecret).update(raw).digest('base64');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
    const id = body.TransactionId ?? body.InvoiceId;
    if (id === undefined || id === null) return null;
    const st = String(body.Status ?? '');
    const status =
      st === 'Completed' || st === 'Authorized'
        ? ('succeeded' as const)
        : st === 'Cancelled' || st === 'Declined'
          ? ('cancelled' as const)
          : null;
    if (!status) return null;
    return { providerPaymentId: String(id), status, rawPayload: body };
  }

  webhookAck(): Record<string, unknown> {
    return { code: 0 };
  }
}
```

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/cloudpayments-payment.provider.test.ts --no-file-parallelism`
Expected: PASS (5 tests).

- [x] **Step 5: Register (credential-gated)**

```ts
if (backendEnv.CLOUDPAYMENTS_PUBLIC_ID && backendEnv.CLOUDPAYMENTS_API_SECRET) {
  reg.set(
    'cloudpayments',
    new CloudPaymentsProvider({
      publicId: backendEnv.CLOUDPAYMENTS_PUBLIC_ID,
      apiSecret: backendEnv.CLOUDPAYMENTS_API_SECRET,
      apiBase: backendEnv.CLOUDPAYMENTS_API_BASE
    })
  );
}
```

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/infrastructure/payments/cloudpayments-payment.provider.* apps/backend/src/modules/payments/payments.module.ts
git commit -m "feat(payments): CloudPayments adapter (Basic-auth order + HMAC webhook)"
```

---

## Task 8: Robokassa adapter

> **Verify against current Robokassa docs:** the create signature `md5(MerchantLogin:OutSum:InvId:Password1)`, the redirect URL params, the ResultURL signature `md5(OutSum:InvId:Password2)`, and the required `OK{InvId}` ACK.

**Files:**

- Create: `apps/backend/src/infrastructure/payments/robokassa-payment.provider.ts`
- Test: `apps/backend/src/infrastructure/payments/robokassa-payment.provider.test.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`

- [x] **Step 1: Write the failing test**

```ts
// apps/backend/src/infrastructure/payments/robokassa-payment.provider.test.ts
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { orderToInvId, RobokassaProvider } from './robokassa-payment.provider.js';

const cfg = {
  merchantLogin: 'shop',
  password1: 'p1',
  password2: 'p2',
  payUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx'
};

function md5(s: string) {
  return createHash('md5').update(s).digest('hex');
}

describe('RobokassaProvider.createPayment', () => {
  it('builds a signed redirect URL (no HTTP) with rubles OutSum', async () => {
    const p = new RobokassaProvider(cfg);
    const res = await p.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс'
    });
    const invId = orderToInvId('o1');
    expect(res.status).toBe('pending');
    expect(res.providerPaymentId).toBe(String(invId));
    const url = new URL(res.confirmationUrl!);
    expect(url.searchParams.get('OutSum')).toBe('1500.00');
    expect(url.searchParams.get('InvId')).toBe(String(invId));
    expect(url.searchParams.get('SignatureValue')).toBe(md5(`shop:1500.00:${invId}:p1`));
  });
});

describe('RobokassaProvider.parseWebhook', () => {
  it('verifies the ResultURL md5 and maps to succeeded', async () => {
    const p = new RobokassaProvider(cfg);
    const body = `OutSum=1500.00&InvId=42&SignatureValue=${md5('1500.00:42:p2')}`;
    const ev = await p.parseWebhook(Buffer.from(body), {
      'content-type': 'application/x-www-form-urlencoded'
    });
    expect(ev).toMatchObject({ providerPaymentId: '42', status: 'succeeded' });
  });
  it('returns null on a bad signature', async () => {
    const p = new RobokassaProvider(cfg);
    const ev = await p.parseWebhook(Buffer.from('OutSum=1500.00&InvId=42&SignatureValue=bad'), {});
    expect(ev).toBeNull();
  });
  it('acks with OK{InvId}', async () => {
    const p = new RobokassaProvider(cfg);
    const raw = Buffer.from(`OutSum=1500.00&InvId=42&SignatureValue=${md5('1500.00:42:p2')}`);
    const ev = await p.parseWebhook(raw, {});
    expect(p.webhookAck(ev, raw)).toBe('OK42');
  });
});
```

- [x] **Step 2: Run (FAIL) → Step 3: write the adapter → Step 4: run (PASS)**

```ts
// apps/backend/src/infrastructure/payments/robokassa-payment.provider.ts
import { createHash } from 'node:crypto';

import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

export interface RobokassaConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  payUrl: string;
}

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex');
}

/** Robokassa requires a positive 31-bit integer InvId; derive a stable one from the UUID order id. */
export function orderToInvId(orderId: string): number {
  const hex = createHash('sha256').update(orderId).digest('hex').slice(0, 8);
  return parseInt(hex, 16) & 0x7fffffff || 1;
}

export class RobokassaProvider implements PaymentProvider {
  readonly code = 'robokassa' as const;

  constructor(private readonly cfg: RobokassaConfig) {}

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const outSum = (params.amount / 100).toFixed(2);
    const invId = orderToInvId(params.orderId);
    const signature = md5(`${this.cfg.merchantLogin}:${outSum}:${invId}:${this.cfg.password1}`);
    const url = new URL(this.cfg.payUrl);
    url.searchParams.set('MerchantLogin', this.cfg.merchantLogin);
    url.searchParams.set('OutSum', outSum);
    url.searchParams.set('InvId', String(invId));
    url.searchParams.set('Description', params.description);
    url.searchParams.set('SignatureValue', signature);
    return { providerPaymentId: String(invId), status: 'pending', confirmationUrl: url.toString() };
  }

  async parseWebhook(raw: Buffer): Promise<WebhookEvent | null> {
    const params = new URLSearchParams(raw.toString('utf8'));
    const outSum = params.get('OutSum');
    const invId = params.get('InvId');
    const sig = params.get('SignatureValue');
    if (!outSum || !invId || !sig) return null;
    const expected = md5(`${outSum}:${invId}:${this.cfg.password2}`);
    if (sig.toLowerCase() !== expected.toLowerCase()) return null;
    return {
      providerPaymentId: invId,
      status: 'succeeded',
      rawPayload: Object.fromEntries(params.entries())
    };
  }

  webhookAck(event: WebhookEvent | null): string {
    return event ? `OK${event.providerPaymentId}` : 'OK';
  }
}
```

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/payments/robokassa-payment.provider.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [x] **Step 5: Register (credential-gated)**

```ts
if (backendEnv.ROBOKASSA_MERCHANT_LOGIN && backendEnv.ROBOKASSA_PASSWORD_1) {
  reg.set(
    'robokassa',
    new RobokassaProvider({
      merchantLogin: backendEnv.ROBOKASSA_MERCHANT_LOGIN,
      password1: backendEnv.ROBOKASSA_PASSWORD_1,
      password2: backendEnv.ROBOKASSA_PASSWORD_2,
      payUrl: backendEnv.ROBOKASSA_PAY_URL
    })
  );
}
```

- [x] **Step 6: Run all payments tests + typecheck**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments src/infrastructure/payments --no-file-parallelism && pnpm typecheck`
Expected: PASS; 8/8.

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/infrastructure/payments/robokassa-payment.provider.* apps/backend/src/modules/payments/payments.module.ts
git commit -m "feat(payments): Robokassa adapter (md5 redirect + ResultURL webhook)"
```

---

## Task 9: Settings endpoints + DTO + HTTP integration boundary

**Files:**

- Modify: `apps/backend/src/modules/payments/payments.dto.ts`
- Modify: `apps/backend/src/modules/payments/payments.controller.ts`
- Modify: `apps/backend/src/modules/payments/payments.http.integration.test.ts`

- [x] **Step 1: Add the settings DTO (`payments.dto.ts`)**

```ts
import { IsBoolean, IsIn } from 'class-validator';

const PROVIDER_CODES = [
  'noop',
  'fake',
  'yookassa',
  'tinkoff',
  'cloudpayments',
  'robokassa'
] as const;

export class ProviderSettingsRequest {
  @IsIn(PROVIDER_CODES as unknown as string[])
  providerCode!: (typeof PROVIDER_CODES)[number];

  @IsBoolean()
  enabled!: boolean;
}
```

(Keep existing imports; merge the `class-validator` import line if one already exists.)

- [x] **Step 2: Add endpoints to `payments.controller.ts`**

Inject the settings service:

```ts
constructor(
  @Inject(PaymentsService) private readonly payments: PaymentsService,
  @Inject(PaymentProviderSettingsService) private readonly settings: PaymentProviderSettingsService
) {}
```

Add the two endpoints (imports: `Put`, `assertValidDto`, `ProviderSettingsRequest`, `PaymentProviderSettingsService`):

```ts
@Get('payments/provider-settings')
@UseGuards(PermissionGuard)
@RequirePermissions('payments.configure')
getProviderSettings(@CurrentContext() c: RequestContext) {
  return this.settings.get(c.tenantId!);
}

@Put('payments/provider-settings')
@UseGuards(PermissionGuard)
@RequirePermissions('payments.configure')
saveProviderSettings(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
  const dto = assertValidDto(ProviderSettingsRequest, raw);
  return this.settings.save(c.tenantId!, dto);
}
```

- [x] **Step 3: Write the failing HTTP integration assertions**

In `payments.http.integration.test.ts`, add to the stub controller a `payments.configure`-guarded settings route mirror, and assert:

- `GET /payments/provider-settings` requires `payments.configure` (403 without, 200 with).
- `PUT /payments/provider-settings` requires `payments.configure`.
- `POST /payments/webhook/fake` (no auth) resolves an order by `provider_payment_id` and returns 200.
- `POST /payments/webhook/unknowncode` returns 200 no-op.

Follow the existing stub-controller pattern in the file (do not boot the real module). Example boundary assertion shape (match the file's existing helpers):

```ts
it('GET /payments/provider-settings needs payments.configure', async () => {
  await request(app.getHttpServer())
    .get('/payments/provider-settings')
    .set(headersWithout('payments.configure'))
    .expect(403);
  await request(app.getHttpServer())
    .get('/payments/provider-settings')
    .set(headersWith('payments.configure'))
    .expect(200);
});
```

- [x] **Step 4: Run it (FAIL), wire the stub, run again (PASS)**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/payments/payments.http.integration.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments/payments.dto.ts apps/backend/src/modules/payments/payments.controller.ts apps/backend/src/modules/payments/payments.http.integration.test.ts
git commit -m "feat(payments): /admin payments provider-settings endpoints (payments.configure)"
```

---

## Task 10: Frontend — `/admin/payments/settings` page

**Files:**

- Modify/Create: `apps/frontend/src/features/payments/api.ts` (add settings get/save)
- Create: `apps/frontend/src/features/payments/settings-screen.tsx`
- Create: `apps/frontend/app/admin/payments/settings/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts`
- Test: `apps/frontend/src/features/payments/api.contract.test.ts`
- Test: `apps/frontend/src/e2e/payments-settings.e2e.test.ts`

- [x] **Step 1: Add the API functions (`features/payments/api.ts`)**

Mirror the webinar settings client. Add:

```ts
export interface PaymentProviderSettings {
  tenantId: string;
  providerCode: string;
  enabled: boolean;
  updatedAt: string;
}

export async function getPaymentProviderSettings(): Promise<PaymentProviderSettings> {
  return apiRequest<PaymentProviderSettings>('/payments/provider-settings');
}

export async function savePaymentProviderSettings(input: {
  providerCode: string;
  enabled: boolean;
}): Promise<PaymentProviderSettings> {
  return apiRequest<PaymentProviderSettings>('/payments/provider-settings', {
    method: 'PUT',
    body: JSON.stringify(input)
  });
}
```

(Use the project's `apiRequest` import already used in this feature's api.ts.)

- [x] **Step 2: Write the api.contract test**

```ts
// apps/frontend/src/features/payments/api.contract.test.ts (add cases)
import { describe, expect, it, vi } from 'vitest';

import { getPaymentProviderSettings } from './api.js';

describe('payments provider-settings api', () => {
  it('unwraps the envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { tenantId: 't1', providerCode: 'yookassa', enabled: true, updatedAt: 'x' },
          meta: {}
        })
      })
    );
    const res = await getPaymentProviderSettings();
    expect(res.providerCode).toBe('yookassa');
    vi.unstubAllGlobals();
  });
});
```

- [x] **Step 3: Run it (FAIL → after api.ts edit, PASS)**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/payments/api.contract.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 4: Build the settings screen + page**

`settings-screen.tsx`: a `PageContainer`/`PageHeader`/`SectionCard` form with a provider `<select>` (options: noop, fake, yookassa, tinkoff, cloudpayments, robokassa), an "enabled" checkbox, and a Save button. State via `useState` + async (`useDomainMutations.wrap` if the feature uses it; otherwise a local `useState` loading/error pattern matching the webinar settings screen). Load with `getPaymentProviderSettings` in `useEffect`; save with `savePaymentProviderSettings`.

`app/admin/payments/settings/page.tsx`: wrap the screen in `<ProtectedPage>` (mirror `app/admin/webinars/settings/page.tsx`).

- [x] **Step 5: Add navigation + route policy (`features/navigation/model.ts`)**

Add to `routeMeta`: `'/admin/payments/settings'` with access policy requiring `payments.configure`. **Declare it BEFORE any broader `/admin/payments` entry** (Phase 8 lesson — a broader prefix entry would otherwise shadow the policy). Add a `navigationModel` entry (label "Платёжный провайдер", appropriate nav slot).

- [x] **Step 6: Write the e2e route-access + ordering regression**

```ts
// apps/frontend/src/e2e/payments-settings.e2e.test.ts
import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/model.js';

describe('/admin/payments/settings access', () => {
  it('requires payments.configure', () => {
    expect(evaluateRouteAccess('/admin/payments/settings', { permissions: [] }).allowed).toBe(
      false
    );
    expect(
      evaluateRouteAccess('/admin/payments/settings', { permissions: ['payments.configure'] })
        .allowed
    ).toBe(true);
  });
});
```

(Match the exact signature of `evaluateRouteAccess` used by the existing e2e tests — read `canonical-e2e-readiness.e2e.test.ts` for the real call shape and adapt.)

- [x] **Step 7: Run frontend payments + e2e + typecheck**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/payments src/e2e/payments-settings.e2e.test.ts --no-file-parallelism && pnpm typecheck`
Expected: PASS; 8/8.

- [x] **Step 8: Commit**

```bash
git add apps/frontend/src/features/payments apps/frontend/app/admin/payments/settings apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/payments-settings.e2e.test.ts
git commit -m "feat(payments): /admin/payments/settings per-tenant provider page"
```

---

## Task 11: Full verification + docs

**Files:**

- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (new §5.NNN entry)
- Tick the plan checkboxes.

- [x] **Step 1: Backend payments cluster + global typecheck/lint**

Run:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/payments src/infrastructure/payments src/env.payments.test.ts --no-file-parallelism
pnpm typecheck
npx eslint apps/backend/src/modules/payments apps/backend/src/infrastructure/payments --max-warnings=0
```

Expected: all green; typecheck 8/8.

- [x] **Step 2: Frontend payments + lint**

Run:

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/features/payments src/e2e/payments-settings.e2e.test.ts --no-file-parallelism
npx eslint apps/frontend/src/features/payments --max-warnings=0
```

Expected: green.

- [x] **Step 3: Update README §2 + LMS_AGENT_HANDOFF §5.NNN**

Record: branch, what shipped (registry + resolver + 4 adapters + settings + migration 0056 + rawBody), test status, migration number (0056), and the remaining activation steps (acquirer contract + live creds + `PAYMENTS_ENABLED=true` + tenant selects provider). Follow the handoff protocol in CLAUDE.md.

- [x] **Step 4: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-22-phase-7-payments-multi-provider.md
git commit -m "docs: record Phase 7 payments multi-provider activation (§5.NNN)"
```

---

## Notes for the implementer

- **Cyrillic path:** run backend tests with `--no-file-parallelism` and per-file/per-module; the full backend suite crashes (tinypool). See CLAUDE.md Gotchas.
- **Explicit `@Inject`:** every constructor param in `@Injectable()`/`@Controller()` classes must use `@Inject(...)` (the static DI guard enforces this; type-based DI deadlocks under tsx). The provider classes are plain (not Nest-managed) — they take config via plain constructors, which is fine.
- **Acquirer API fidelity:** the four adapters encode each provider's documented contract to the best current knowledge. Each has a "Verify against current docs" note — confirm field names and signature formulas against live docs before go-live; the unit tests pin the _encoded_ behavior so a doc-driven change is a localized edit + test update.
- **No live credentials are needed to merge:** every adapter is unit-tested with a mocked `fetch`/pure crypto; the registry omits an adapter whose env creds are blank.

```

```
