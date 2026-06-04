# Phase 5 · Plan 5A — Notification Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the platform a provider-agnostic email engine (templates + delivery journal + dispatcher) wired to domain events, so learners get e-mail on enrollment and course completion — with a Noop default that needs no SMTP to ship.

**Architecture:** Backend-centric. A `MailerService` interface mirrors the existing `AntivirusScanner` infra pattern (interface + `Noop` default + real impl selected by an env flag). Two new `communication` tables (`email_templates`, `email_deliveries`) use the module's repository pattern (interface token + in-memory + postgres impls). A `NotificationDispatcher` renders a template, sends via the mailer, and records a delivery. Domain events carry the resolved recipient in their payload (the codebase's established "producer resolves what the listener needs" idiom — see `enrollment-completed.event.ts`), so listeners never reach back into other modules.

**Tech Stack:** TypeScript (NodeNext ESM — every relative import ends in `.js`), NestJS, `@nestjs/event-emitter`, Zod env schema, PostgreSQL, `nodemailer`, Vitest.

**Source spec:** [docs/superpowers/specs/2026-06-04-phase-5-notifications-recertifications-design.md](../specs/2026-06-04-phase-5-notifications-recertifications-design.md)

---

## Scope of Plan 5A (and what is deliberately deferred to 5B)

**In 5A:** mailer infra, email templates (code defaults + DB override), delivery journal, dispatcher, `notifications.read/write` permissions + admin endpoints, and these wired emails:

- `learning.enrollment_invited` → "приглашение на курс" (learner)
- `learning.enrollment_completed` → "курс завершён, документ готов" (learner) — folds the spec's separate "document issued" mail into one completion mail for the MVP.

**Emitted in 5A, consumed in 5B:** the `documents.revoked` event is emitted (cheap, correct) but its e-mail listener is **deferred to 5B**, because notifying the learner on revocation requires an enrollment→learner recipient resolver that `DocumentsService` does not have and that 5B builds for recertification. No listener on this event in 5A is fine (events may have zero listeners).

**Not in 5A:** recertification cycle, scheduler, `recertification_drafts`, employer/curator recipient resolution, course-deadline and license-expiry reminders — all 5B. PWA push, личное дело PDF, template editor UI, real SMTP provisioning — deferred per spec §7.

---

## File Structure

**Mailer infra** (`apps/backend/src/infrastructure/mailer/` — plain classes, NOT `@Injectable`, mirroring `infrastructure/antivirus/`):

- Create `mailer.service.ts` — `MailerService` interface + `MAILER` Symbol token + `NoopMailer` (default).
- Create `smtp-mailer.service.ts` — `SmtpMailer` (real impl; injectable `createTransport` factory for testability).
- Create `mailer.service.test.ts`, `smtp-mailer.service.test.ts` — colocated unit tests.

**Communication module** (`apps/backend/src/modules/communication/`):

- Create `email-templates.ts` — `EmailTemplateKey` type + `EMAIL_TEMPLATE_DEFAULTS` registry + pure `renderTemplate(...)`.
- Create `email-templates.repository.ts` — `EmailTemplatesRepository` interface + `EMAIL_TEMPLATES_REPOSITORY` token + row type.
- Create `in-memory-email-templates.state.ts`, `postgres-email-templates.repository.ts` — the two backends.
- Create `email-deliveries.repository.ts` — `EmailDeliveriesRepository` interface + `EMAIL_DELIVERIES_REPOSITORY` token + row type.
- Create `in-memory-email-deliveries.state.ts`, `postgres-email-deliveries.repository.ts` — the two backends.
- Create `notification-dispatcher.service.ts` — orchestration (render → send → record).
- Create `enrollment-email.listener.ts` — `@OnEvent` listeners for invited + completed.
- Create `upsert-email-template.dto.ts` — request DTO.
- Create `email-notifications.controller.ts` — admin endpoints (deliveries list, template get/upsert).
- Create `email-notifications.service.test.ts` — unit tests for templates/deliveries/dispatcher/listener.
- Modify `communication.module.ts` — register all new providers + controller.

**MVP module** (`apps/backend/src/modules/mvp/`):

- Create `enrollment-invited.event.ts` — event constant + payload.
- Modify `mvp.service.ts` — emit `enrollment_invited` in `createEnrollment`; add `recipient` to the `enrollment_completed` emit.
- Modify `enrollment-completed.event.ts` — add optional `recipient` to the payload.

**Documents module** (`apps/backend/src/modules/documents/`):

- Create `document-revoked.event.ts` — event constant + payload.
- Modify `documents.service.ts` — inject `EventEmitter2`; emit `documents.revoked` in `revokeDocument`.
- Modify `documents.service.test.ts` — fix constructor arity.

**Cross-cutting:**

- Modify `apps/backend/src/env.schema.ts` + `.env.example` — `NOTIFICATIONS_EMAIL_ENABLED` + `SMTP_*`.
- Modify `apps/backend/package.json` — add `nodemailer` + `@types/nodemailer`.
- Create `apps/backend/migrations/0047_communication_email_foundation.sql` — two tables + permissions.
- Modify `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` — add a `notifications` permission-boundary `describe` block (per CLAUDE.md: extend this file, don't create a new one).

---

## Task 1: Migration — email tables + permissions

**Files:**

- Create: `apps/backend/migrations/0047_communication_email_foundation.sql`

> Latest migration on `main` is `0046_frdo_registry_export.sql`, so the next number is **0047**. (Older docs say 0038 — stale.) Conventions mirrored from `0007_communication_realtime_foundation.sql` (DDL) and `0037_iam_org_licenses_permissions.sql` (permissions): `id text primary key`, `tenant_id text not null` (no DB-level FK — tenant isolation is enforced in code), `timestamptz` timestamps, `jsonb` suffixed `_jsonb`, status columns are plain `text` (no CHECK), indexes lead with `tenant_id`.

- [x] **Step 1: Write the migration SQL**

Create `apps/backend/migrations/0047_communication_email_foundation.sql`:

```sql
-- 0047_communication_email_foundation.sql
-- Phase 5 Plan 5A — email notification foundation.
-- 1) communication.email_templates — per-tenant overrides of code-default email texts (spec §3.2).
-- 2) communication.email_deliveries — append-only journal of every send attempt (spec §3.3).
-- 3) iam permissions notifications.read / notifications.write + role assignments.

create table if not exists communication.email_templates (
  id text primary key,
  tenant_id text not null,
  template_key text not null,
  subject text not null,
  body text not null,
  updated_by text null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_email_templates_tenant_key
  on communication.email_templates (tenant_id, template_key);

create table if not exists communication.email_deliveries (
  id text primary key,
  tenant_id text not null,
  template_key text not null,
  recipient_email text not null,
  recipient_kind text not null,
  subject text not null,
  status text not null,
  provider_message_id text null,
  error text null,
  related_entity_type text null,
  related_entity_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_deliveries_tenant_created
  on communication.email_deliveries (tenant_id, created_at);
create index if not exists idx_email_deliveries_tenant_template
  on communication.email_deliveries (tenant_id, template_key);

insert into iam.permissions (id, code, description)
values
  ('p_notifications_read', 'notifications.read', 'Read notification deliveries and email templates'),
  ('p_notifications_write', 'notifications.write', 'Manage notification email templates')
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
    r.code in ('platform_admin', 'tenant_admin')
    or (r.code = 'methodist' and p.code = 'notifications.read')
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
```

- [x] **Step 2: Verify the migration applies cleanly**

Run: `pnpm test:migrations`
Expected: PASS (the migration runner applies `0047` with no SQL errors). If your environment needs the DB up first, run `pnpm docker:infra` then retry.

- [x] **Step 3: Commit**

```bash
git add apps/backend/migrations/0047_communication_email_foundation.sql
git commit -m "feat(backend): migration 0047 — email_templates + email_deliveries + notifications perms"
```

---

## Task 2: MailerService infra (Noop default + SMTP) + env + dependency

**Files:**

- Create: `apps/backend/src/infrastructure/mailer/mailer.service.ts`
- Create: `apps/backend/src/infrastructure/mailer/mailer.service.test.ts`
- Create: `apps/backend/src/infrastructure/mailer/smtp-mailer.service.ts`
- Create: `apps/backend/src/infrastructure/mailer/smtp-mailer.service.test.ts`
- Modify: `apps/backend/src/env.schema.ts`
- Modify: `.env.example`
- Modify: `apps/backend/package.json`

- [x] **Step 1: Add the env vars (Zod schema)**

In `apps/backend/src/env.schema.ts`, inside the `z.object({ ... })`, add these keys (copy the boolean pattern from `ANTIVIRUS_ENABLED` exactly — `z.coerce.boolean()` is a trap that maps the string `"false"` → `true`):

```ts
    NOTIFICATIONS_EMAIL_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).default('no-reply@cdoprof.local'),
```

In `.env.example`, after the antivirus block, add:

```bash
# Email notifications (Phase 5). When false, NoopMailer records deliveries as skipped (dev/pilot).
# Flip to true ONLY when SMTP_* point at a reachable mail server.
NOTIFICATIONS_EMAIL_ENABLED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=no-reply@cdoprof.local
```

- [x] **Step 2: Add the dependency**

In `apps/backend/package.json` add to `dependencies` `"nodemailer": "^6.9.16"` and to `devDependencies` `"@types/nodemailer": "^6.4.17"`. Then run:

Run: `pnpm install`
Expected: lockfile updates, `nodemailer` installed.

- [x] **Step 3: Write the failing test for NoopMailer**

Create `apps/backend/src/infrastructure/mailer/mailer.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { NoopMailer } from './mailer.service.js';

describe('NoopMailer', () => {
  it('does not send and reports skipped_noop', async () => {
    const mailer = new NoopMailer();
    const result = await mailer.send({
      to: 'learner@example.com',
      subject: 'S',
      body: 'B',
      templateKey: 'enrollment_invite'
    });
    expect(result.status).toBe('skipped_noop');
    expect(result.providerMessageId).toBeUndefined();
  });
});
```

- [x] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/mailer/mailer.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./mailer.service.js`.

- [x] **Step 5: Implement the interface + token + NoopMailer**

Create `apps/backend/src/infrastructure/mailer/mailer.service.ts`:

```ts
/** Outcome of one send attempt. `skipped_noop` = mailer disabled (no real send happened). */
export type EmailSendStatus = 'sent' | 'failed' | 'skipped_noop';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  /** Template key, carried through for the delivery journal. */
  templateKey: string;
}

export interface SendResult {
  status: EmailSendStatus;
  providerMessageId?: string;
  error?: string;
}

export interface MailerService {
  send(message: EmailMessage): Promise<SendResult>;
}

/** DI token for the active mailer. Mirrors ANTIVIRUS_SCANNER. */
export const MAILER = Symbol('MAILER');

/**
 * Default mailer for dev/test and any environment where NOTIFICATIONS_EMAIL_ENABLED=false.
 * Records the attempt as skipped_noop so the dispatcher + journal flow is fully exercised
 * without an SMTP server. Real sending is opt-in via SmtpMailer behind the flag.
 */
export class NoopMailer implements MailerService {
  async send(_message: EmailMessage): Promise<SendResult> {
    return { status: 'skipped_noop' };
  }
}
```

- [x] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/mailer/mailer.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 7: Write the failing test for SmtpMailer**

Create `apps/backend/src/infrastructure/mailer/smtp-mailer.service.test.ts` (uses an injected fake `createTransport` so no real SMTP is needed — mirrors how `ClamAvAntivirusScanner` takes an injectable `connect`):

```ts
import { describe, expect, it, vi } from 'vitest';

import { SmtpMailer } from './smtp-mailer.service.js';

describe('SmtpMailer', () => {
  const config = { host: 'mail', port: 587, from: 'no-reply@cdoprof.local' };

  it('sends via the transport and maps the message id', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc-123' });
    const createTransport = vi.fn().mockReturnValue({ sendMail });
    const mailer = new SmtpMailer(config, createTransport as never);

    const result = await mailer.send({
      to: 'learner@example.com',
      subject: 'S',
      body: 'B',
      templateKey: 'enrollment_invite'
    });

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('abc-123');
    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@cdoprof.local',
      to: 'learner@example.com',
      subject: 'S',
      text: 'B'
    });
  });

  it('reports failed and the error message when the transport throws', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('connection refused'));
    const createTransport = vi.fn().mockReturnValue({ sendMail });
    const mailer = new SmtpMailer(config, createTransport as never);

    const result = await mailer.send({
      to: 'x@example.com',
      subject: 'S',
      body: 'B',
      templateKey: 'course_completed'
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('connection refused');
  });
});
```

- [x] **Step 8: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/mailer/smtp-mailer.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./smtp-mailer.service.js`.

- [x] **Step 9: Implement SmtpMailer**

Create `apps/backend/src/infrastructure/mailer/smtp-mailer.service.ts`:

```ts
import { createTransport as realCreateTransport } from 'nodemailer';

import type { EmailMessage, MailerService, SendResult } from './mailer.service.js';

export interface SmtpMailerConfig {
  host: string;
  port: number;
  from: string;
  user?: string;
  password?: string;
}

/** Minimal transport surface we depend on — keeps the impl unit-testable with a fake. */
interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

export type CreateTransport = (config: SmtpMailerConfig) => MailTransport;

const defaultCreateTransport: CreateTransport = (config) =>
  realCreateTransport({
    host: config.host,
    port: config.port,
    auth: config.user ? { user: config.user, pass: config.password } : undefined
  }) as unknown as MailTransport;

export class SmtpMailer implements MailerService {
  private readonly transport: MailTransport;

  constructor(
    private readonly config: SmtpMailerConfig,
    createTransport: CreateTransport = defaultCreateTransport
  ) {
    this.transport = createTransport(config);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const info = await this.transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.body
      });
      return { status: 'sent', ...(info.messageId ? { providerMessageId: info.messageId } : {}) };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

> Note `exactOptionalPropertyTypes: true` is on — that's why `providerMessageId` is added by conditional spread, never set to `undefined`.

- [x] **Step 10: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/mailer/smtp-mailer.service.test.ts --no-file-parallelism`
Expected: PASS (both cases).

- [x] **Step 11: Commit**

```bash
git add apps/backend/src/infrastructure/mailer apps/backend/src/env.schema.ts .env.example apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(backend): MailerService infra (Noop default + SMTP) + email env vars"
```

---

## Task 3: Email templates — code defaults + override repository + render

**Files:**

- Create: `apps/backend/src/modules/communication/email-templates.ts`
- Create: `apps/backend/src/modules/communication/email-templates.repository.ts`
- Create: `apps/backend/src/modules/communication/in-memory-email-templates.state.ts`
- Create: `apps/backend/src/modules/communication/postgres-email-templates.repository.ts`
- Test: `apps/backend/src/modules/communication/email-notifications.service.test.ts` (new shared test file for this plan's services)

- [x] **Step 1: Write the failing test for defaults + render**

Create `apps/backend/src/modules/communication/email-notifications.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { EMAIL_TEMPLATE_DEFAULTS, renderTemplate } from './email-templates.js';

describe('email templates', () => {
  it('has a default for every template key', () => {
    expect(EMAIL_TEMPLATE_DEFAULTS.enrollment_invite.subject.length).toBeGreaterThan(0);
    expect(EMAIL_TEMPLATE_DEFAULTS.course_completed.subject.length).toBeGreaterThan(0);
  });

  it('interpolates {{variables}} into subject and body', () => {
    const rendered = renderTemplate(
      { subject: 'Курс {{courseTitle}}', body: 'Здравствуйте, {{learnerName}}!' },
      { courseTitle: 'Охрана труда', learnerName: 'Иванов И.' }
    );
    expect(rendered.subject).toBe('Курс Охрана труда');
    expect(rendered.body).toBe('Здравствуйте, Иванов И.!');
  });

  it('replaces an unknown placeholder with an empty string', () => {
    const rendered = renderTemplate({ subject: 'A {{missing}}', body: 'B' }, {});
    expect(rendered.subject).toBe('A ');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./email-templates.js`.

- [x] **Step 3: Implement defaults + render**

Create `apps/backend/src/modules/communication/email-templates.ts`:

```ts
export type EmailTemplateKey = 'enrollment_invite' | 'course_completed';

export interface EmailTemplateBody {
  subject: string;
  body: string;
}

/** Code defaults. Per-tenant overrides in communication.email_templates win over these (spec §2 decision 3). */
export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateKey, EmailTemplateBody> = {
  enrollment_invite: {
    subject: 'Вас записали на курс «{{courseTitle}}»',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Вы записаны на обучение по программе «{{courseTitle}}». ' +
      'Войдите в личный кабинет, чтобы приступить к занятиям.\n\n' +
      'С уважением, учебный центр.'
  },
  course_completed: {
    subject: 'Курс «{{courseTitle}}» завершён',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Вы успешно завершили обучение по программе «{{courseTitle}}». ' +
      'Выданные документы доступны в личном кабинете.\n\n' +
      'С уважением, учебный центр.'
  }
};

/** Pure {{var}} interpolation. Unknown placeholders collapse to an empty string. */
export function renderTemplate(
  template: EmailTemplateBody,
  variables: Record<string, string>
): EmailTemplateBody {
  const apply = (text: string): string =>
    text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
  return { subject: apply(template.subject), body: apply(template.body) };
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: PASS (3 cases).

- [x] **Step 5: Write the failing test for the in-memory templates repository**

Append to `email-notifications.service.test.ts`:

```ts
import { InMemoryEmailTemplatesState } from './in-memory-email-templates.state.js';

describe('email templates repository (in-memory)', () => {
  it('upserts and reads back an override, scoped by tenant', async () => {
    const repo = new InMemoryEmailTemplatesState();
    await repo.upsertOverride('t1', 'enrollment_invite', {
      subject: 'Custom',
      body: 'Body',
      updatedBy: 'u1'
    });
    const found = await repo.getOverride('t1', 'enrollment_invite');
    expect(found?.subject).toBe('Custom');
    expect(await repo.getOverride('t2', 'enrollment_invite')).toBeNull();
  });

  it('upsert replaces an existing override rather than duplicating', async () => {
    const repo = new InMemoryEmailTemplatesState();
    await repo.upsertOverride('t1', 'course_completed', { subject: 'A', body: 'a' });
    await repo.upsertOverride('t1', 'course_completed', { subject: 'B', body: 'b' });
    const list = await repo.listOverrides('t1');
    expect(list).toHaveLength(1);
    expect(list[0]!.subject).toBe('B');
  });
});
```

- [x] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./in-memory-email-templates.state.js`.

- [x] **Step 7: Implement the repository interface + token + row type**

Create `apps/backend/src/modules/communication/email-templates.repository.ts`:

```ts
import type { EmailTemplateKey } from './email-templates.js';

export const EMAIL_TEMPLATES_REPOSITORY = Symbol('EMAIL_TEMPLATES_REPOSITORY');

export interface EmailTemplateOverrideRow {
  id: string;
  tenantId: string;
  templateKey: EmailTemplateKey;
  subject: string;
  body: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface EmailTemplateUpsert {
  subject: string;
  body: string;
  updatedBy?: string;
}

export interface EmailTemplatesRepository {
  getOverride(tenantId: string, key: EmailTemplateKey): Promise<EmailTemplateOverrideRow | null>;
  upsertOverride(
    tenantId: string,
    key: EmailTemplateKey,
    upsert: EmailTemplateUpsert
  ): Promise<EmailTemplateOverrideRow>;
  listOverrides(tenantId: string): Promise<EmailTemplateOverrideRow[]>;
}
```

- [x] **Step 8: Implement the in-memory backend**

Create `apps/backend/src/modules/communication/in-memory-email-templates.state.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { EmailTemplateKey } from './email-templates.js';
import type {
  EmailTemplateOverrideRow,
  EmailTemplatesRepository,
  EmailTemplateUpsert
} from './email-templates.repository.js';

@Injectable()
export class InMemoryEmailTemplatesState implements EmailTemplatesRepository {
  overrides: EmailTemplateOverrideRow[] = [];

  async getOverride(
    tenantId: string,
    key: EmailTemplateKey
  ): Promise<EmailTemplateOverrideRow | null> {
    return this.overrides.find((o) => o.tenantId === tenantId && o.templateKey === key) ?? null;
  }

  async upsertOverride(
    tenantId: string,
    key: EmailTemplateKey,
    upsert: EmailTemplateUpsert
  ): Promise<EmailTemplateOverrideRow> {
    const existing = this.overrides.find((o) => o.tenantId === tenantId && o.templateKey === key);
    const row: EmailTemplateOverrideRow = {
      id: existing?.id ?? `emailtpl_${Math.random().toString(36).slice(2, 10)}`,
      tenantId,
      templateKey: key,
      subject: upsert.subject,
      body: upsert.body,
      ...(upsert.updatedBy ? { updatedBy: upsert.updatedBy } : {}),
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      this.overrides = this.overrides.map((o) => (o === existing ? row : o));
    } else {
      this.overrides.push(row);
    }
    return row;
  }

  async listOverrides(tenantId: string): Promise<EmailTemplateOverrideRow[]> {
    return this.overrides.filter((o) => o.tenantId === tenantId);
  }
}
```

- [x] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: PASS (5 cases total).

- [x] **Step 10: Implement the postgres backend (no unit test — same interface, exercised via migration + app)**

Create `apps/backend/src/modules/communication/postgres-email-templates.repository.ts` (mirrors `postgres-webinars.repository.ts`: bare `DatabaseService` ctor, `$N` params, snake→camel map):

```ts
import { Injectable } from '@nestjs/common';

import { type DatabaseService } from '../../infrastructure/database/database.service.js';

import type { EmailTemplateKey } from './email-templates.js';
import type {
  EmailTemplateOverrideRow,
  EmailTemplatesRepository,
  EmailTemplateUpsert
} from './email-templates.repository.js';

interface EmailTemplateDbRow {
  id: string;
  tenant_id: string;
  template_key: string;
  subject: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
}

@Injectable()
export class PostgresEmailTemplatesRepository implements EmailTemplatesRepository {
  constructor(private readonly db: DatabaseService) {}

  async getOverride(
    tenantId: string,
    key: EmailTemplateKey
  ): Promise<EmailTemplateOverrideRow | null> {
    const rows = await this.db.query<EmailTemplateDbRow>(
      `select * from communication.email_templates where tenant_id = $1 and template_key = $2`,
      [tenantId, key]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async upsertOverride(
    tenantId: string,
    key: EmailTemplateKey,
    upsert: EmailTemplateUpsert
  ): Promise<EmailTemplateOverrideRow> {
    const id = `emailtpl_${Math.random().toString(36).slice(2, 10)}`;
    const rows = await this.db.query<EmailTemplateDbRow>(
      `insert into communication.email_templates
         (id, tenant_id, template_key, subject, body, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (tenant_id, template_key) do update
         set subject = excluded.subject,
             body = excluded.body,
             updated_by = excluded.updated_by,
             updated_at = now()
       returning *`,
      [id, tenantId, key, upsert.subject, upsert.body, upsert.updatedBy ?? null]
    );
    return this.map(rows[0]!);
  }

  async listOverrides(tenantId: string): Promise<EmailTemplateOverrideRow[]> {
    const rows = await this.db.query<EmailTemplateDbRow>(
      `select * from communication.email_templates where tenant_id = $1 order by template_key`,
      [tenantId]
    );
    return rows.map((r) => this.map(r));
  }

  private map(row: EmailTemplateDbRow): EmailTemplateOverrideRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      templateKey: row.template_key as EmailTemplateKey,
      subject: row.subject,
      body: row.body,
      ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
      updatedAt: row.updated_at
    };
  }
}
```

- [x] **Step 11: Commit**

```bash
git add apps/backend/src/modules/communication/email-templates.ts apps/backend/src/modules/communication/email-templates.repository.ts apps/backend/src/modules/communication/in-memory-email-templates.state.ts apps/backend/src/modules/communication/postgres-email-templates.repository.ts apps/backend/src/modules/communication/email-notifications.service.test.ts
git commit -m "feat(backend): email templates — code defaults + override repository + render"
```

---

## Task 4: Email deliveries journal repository

**Files:**

- Create: `apps/backend/src/modules/communication/email-deliveries.repository.ts`
- Create: `apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts`
- Create: `apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts`
- Test: `apps/backend/src/modules/communication/email-notifications.service.test.ts` (append)

- [x] **Step 1: Write the failing test**

Append to `email-notifications.service.test.ts`:

```ts
import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';

describe('email deliveries journal (in-memory)', () => {
  it('records a delivery and lists it back, scoped by tenant', async () => {
    const repo = new InMemoryEmailDeliveriesState();
    await repo.record({
      tenantId: 't1',
      templateKey: 'enrollment_invite',
      recipientEmail: 'a@example.com',
      recipientKind: 'learner',
      subject: 'S',
      status: 'skipped_noop'
    });
    const t1 = await repo.list('t1', {});
    expect(t1.total).toBe(1);
    expect(t1.items[0]!.recipientEmail).toBe('a@example.com');
    expect((await repo.list('t2', {})).total).toBe(0);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./in-memory-email-deliveries.state.js`.

- [x] **Step 3: Implement the repository interface + token + row type**

Create `apps/backend/src/modules/communication/email-deliveries.repository.ts`:

```ts
import type { EmailSendStatus } from '../../infrastructure/mailer/mailer.service.js';
import type { EmailTemplateKey } from './email-templates.js';

export const EMAIL_DELIVERIES_REPOSITORY = Symbol('EMAIL_DELIVERIES_REPOSITORY');

export type RecipientKind = 'learner' | 'employer' | 'curator' | 'admin';

export interface EmailDeliveryRow {
  id: string;
  tenantId: string;
  templateKey: EmailTemplateKey;
  recipientEmail: string;
  recipientKind: RecipientKind;
  subject: string;
  status: EmailSendStatus;
  providerMessageId?: string;
  error?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
}

export type EmailDeliverySeed = Omit<EmailDeliveryRow, 'id' | 'createdAt'>;

export interface EmailDeliveriesQuery {
  page?: number;
  pageSize?: number;
}

export interface EmailDeliveriesRepository {
  record(seed: EmailDeliverySeed): Promise<EmailDeliveryRow>;
  list(
    tenantId: string,
    query: EmailDeliveriesQuery
  ): Promise<{ items: EmailDeliveryRow[]; total: number }>;
}
```

- [x] **Step 4: Implement the in-memory backend**

Create `apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type {
  EmailDeliveriesQuery,
  EmailDeliveriesRepository,
  EmailDeliveryRow,
  EmailDeliverySeed
} from './email-deliveries.repository.js';

@Injectable()
export class InMemoryEmailDeliveriesState implements EmailDeliveriesRepository {
  deliveries: EmailDeliveryRow[] = [];

  async record(seed: EmailDeliverySeed): Promise<EmailDeliveryRow> {
    const row: EmailDeliveryRow = {
      ...seed,
      id: `emaildlv_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString()
    };
    this.deliveries.unshift(row);
    return row;
  }

  async list(
    tenantId: string,
    query: EmailDeliveriesQuery = {}
  ): Promise<{ items: EmailDeliveryRow[]; total: number }> {
    const all = this.deliveries.filter((d) => d.tenantId === tenantId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    return { items, total: all.length };
  }
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 6: Implement the postgres backend**

Create `apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';

import { type DatabaseService } from '../../infrastructure/database/database.service.js';

import type { EmailSendStatus } from '../../infrastructure/mailer/mailer.service.js';
import type {
  EmailDeliveriesQuery,
  EmailDeliveriesRepository,
  EmailDeliveryRow,
  EmailDeliverySeed,
  RecipientKind
} from './email-deliveries.repository.js';
import type { EmailTemplateKey } from './email-templates.js';

interface EmailDeliveryDbRow {
  id: string;
  tenant_id: string;
  template_key: string;
  recipient_email: string;
  recipient_kind: string;
  subject: string;
  status: string;
  provider_message_id: string | null;
  error: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  total_count?: string;
}

@Injectable()
export class PostgresEmailDeliveriesRepository implements EmailDeliveriesRepository {
  constructor(private readonly db: DatabaseService) {}

  async record(seed: EmailDeliverySeed): Promise<EmailDeliveryRow> {
    const id = `emaildlv_${Math.random().toString(36).slice(2, 10)}`;
    const rows = await this.db.query<EmailDeliveryDbRow>(
      `insert into communication.email_deliveries
         (id, tenant_id, template_key, recipient_email, recipient_kind, subject, status,
          provider_message_id, error, related_entity_type, related_entity_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       returning *`,
      [
        id,
        seed.tenantId,
        seed.templateKey,
        seed.recipientEmail,
        seed.recipientKind,
        seed.subject,
        seed.status,
        seed.providerMessageId ?? null,
        seed.error ?? null,
        seed.relatedEntityType ?? null,
        seed.relatedEntityId ?? null
      ]
    );
    return this.map(rows[0]!);
  }

  async list(
    tenantId: string,
    query: EmailDeliveriesQuery = {}
  ): Promise<{ items: EmailDeliveryRow[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const rows = await this.db.query<EmailDeliveryDbRow>(
      `select *, count(*) over()::text as total_count
       from communication.email_deliveries
       where tenant_id = $1
       order by created_at desc
       limit $2 offset $3`,
      [tenantId, pageSize, (page - 1) * pageSize]
    );
    return {
      items: rows.map((r) => this.map(r)),
      total: Number(rows[0]?.total_count ?? 0)
    };
  }

  private map(row: EmailDeliveryDbRow): EmailDeliveryRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      templateKey: row.template_key as EmailTemplateKey,
      recipientEmail: row.recipient_email,
      recipientKind: row.recipient_kind as RecipientKind,
      subject: row.subject,
      status: row.status as EmailSendStatus,
      ...(row.provider_message_id ? { providerMessageId: row.provider_message_id } : {}),
      ...(row.error ? { error: row.error } : {}),
      ...(row.related_entity_type ? { relatedEntityType: row.related_entity_type } : {}),
      ...(row.related_entity_id ? { relatedEntityId: row.related_entity_id } : {}),
      createdAt: row.created_at
    };
  }
}
```

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/communication/email-deliveries.repository.ts apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts apps/backend/src/modules/communication/email-notifications.service.test.ts
git commit -m "feat(backend): email deliveries journal repository (in-memory + postgres)"
```

---

## Task 5: NotificationDispatcher + module wiring

**Files:**

- Create: `apps/backend/src/modules/communication/notification-dispatcher.service.ts`
- Modify: `apps/backend/src/modules/communication/communication.module.ts`
- Test: `apps/backend/src/modules/communication/email-notifications.service.test.ts` (append)

- [x] **Step 1: Write the failing test**

Append to `email-notifications.service.test.ts`:

```ts
import { NoopMailer } from '../../infrastructure/mailer/mailer.service.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';

function makeDispatcher() {
  const templates = new InMemoryEmailTemplatesState();
  const deliveries = new InMemoryEmailDeliveriesState();
  const dispatcher = new NotificationDispatcher(new NoopMailer(), templates, deliveries);
  return { dispatcher, templates, deliveries };
}

describe('NotificationDispatcher', () => {
  it('renders the default template and records a skipped_noop delivery', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    await dispatcher.dispatch({
      tenantId: 't1',
      templateKey: 'enrollment_invite',
      recipients: [{ email: 'a@example.com', name: 'Иванов', kind: 'learner' }],
      variables: { courseTitle: 'ОТ', learnerName: 'Иванов' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.total).toBe(1);
    expect(list.items[0]!.status).toBe('skipped_noop');
    expect(list.items[0]!.subject).toBe('Вас записали на курс «ОТ»');
    expect(list.items[0]!.recipientKind).toBe('learner');
  });

  it('uses a tenant override when present', async () => {
    const { dispatcher, templates, deliveries } = makeDispatcher();
    await templates.upsertOverride('t1', 'enrollment_invite', {
      subject: 'Переопределённая тема {{courseTitle}}',
      body: 'тело'
    });
    await dispatcher.dispatch({
      tenantId: 't1',
      templateKey: 'enrollment_invite',
      recipients: [{ email: 'a@example.com', kind: 'learner' }],
      variables: { courseTitle: 'ПБ' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.items[0]!.subject).toBe('Переопределённая тема ПБ');
  });

  it('records one delivery per recipient', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    await dispatcher.dispatch({
      tenantId: 't1',
      templateKey: 'course_completed',
      recipients: [
        { email: 'a@example.com', kind: 'learner' },
        { email: 'b@example.com', kind: 'employer' }
      ],
      variables: { courseTitle: 'ОТ', learnerName: 'Иванов' }
    });
    expect((await deliveries.list('t1', {})).total).toBe(2);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./notification-dispatcher.service.js`.

- [x] **Step 3: Implement the dispatcher**

Create `apps/backend/src/modules/communication/notification-dispatcher.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { MAILER } from '../../infrastructure/mailer/mailer.service.js';
import { EMAIL_DELIVERIES_REPOSITORY, type RecipientKind } from './email-deliveries.repository.js';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  renderTemplate,
  type EmailTemplateKey
} from './email-templates.js';
import { EMAIL_TEMPLATES_REPOSITORY } from './email-templates.repository.js';

import type { MailerService } from '../../infrastructure/mailer/mailer.service.js';
import type { EmailDeliveriesRepository } from './email-deliveries.repository.js';
import type { EmailTemplatesRepository } from './email-templates.repository.js';

export interface DispatchRecipient {
  email: string;
  name?: string;
  kind: RecipientKind;
}

export interface DispatchInput {
  tenantId: string;
  templateKey: EmailTemplateKey;
  recipients: DispatchRecipient[];
  variables: Record<string, string>;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

@Injectable()
export class NotificationDispatcher {
  constructor(
    @Inject(MAILER) private readonly mailer: MailerService,
    @Inject(EMAIL_TEMPLATES_REPOSITORY) private readonly templates: EmailTemplatesRepository,
    @Inject(EMAIL_DELIVERIES_REPOSITORY) private readonly deliveries: EmailDeliveriesRepository
  ) {}

  async dispatch(input: DispatchInput): Promise<void> {
    const override = await this.templates.getOverride(input.tenantId, input.templateKey);
    const base = override ?? EMAIL_TEMPLATE_DEFAULTS[input.templateKey];
    const rendered = renderTemplate(base, input.variables);

    for (const recipient of input.recipients) {
      const result = await this.mailer.send({
        to: recipient.email,
        subject: rendered.subject,
        body: rendered.body,
        templateKey: input.templateKey
      });
      await this.deliveries.record({
        tenantId: input.tenantId,
        templateKey: input.templateKey,
        recipientEmail: recipient.email,
        recipientKind: recipient.kind,
        subject: rendered.subject,
        status: result.status,
        ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        ...(result.error ? { error: result.error } : {}),
        ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
        ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {})
      });
    }
  }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: PASS (all dispatcher cases).

- [x] **Step 5: Wire everything into CommunicationModule**

In `apps/backend/src/modules/communication/communication.module.ts`, add imports at the top:

```ts
import { backendEnv } from '../../env.js';
import { MAILER, NoopMailer } from '../../infrastructure/mailer/mailer.service.js';
import { SmtpMailer } from '../../infrastructure/mailer/smtp-mailer.service.js';
import { EMAIL_DELIVERIES_REPOSITORY } from './email-deliveries.repository.js';
import { EMAIL_TEMPLATES_REPOSITORY } from './email-templates.repository.js';
import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';
import { InMemoryEmailTemplatesState } from './in-memory-email-templates.state.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { PostgresEmailDeliveriesRepository } from './postgres-email-deliveries.repository.js';
import { PostgresEmailTemplatesRepository } from './postgres-email-templates.repository.js';
```

Add to the `providers` array (the `MAILER` factory mirrors the antivirus `useFactory`; repositories follow the Pattern B static `useClass` binding to Postgres):

```ts
    {
      provide: MAILER,
      useFactory: () =>
        backendEnv.NOTIFICATIONS_EMAIL_ENABLED
          ? new SmtpMailer({
              host: backendEnv.SMTP_HOST ?? '',
              port: backendEnv.SMTP_PORT,
              from: backendEnv.SMTP_FROM,
              ...(backendEnv.SMTP_USER ? { user: backendEnv.SMTP_USER } : {}),
              ...(backendEnv.SMTP_PASSWORD ? { password: backendEnv.SMTP_PASSWORD } : {})
            })
          : new NoopMailer()
    },
    PostgresEmailTemplatesRepository,
    { provide: EMAIL_TEMPLATES_REPOSITORY, useClass: PostgresEmailTemplatesRepository },
    PostgresEmailDeliveriesRepository,
    { provide: EMAIL_DELIVERIES_REPOSITORY, useClass: PostgresEmailDeliveriesRepository },
    InMemoryEmailTemplatesState,
    InMemoryEmailDeliveriesState,
    NotificationDispatcher,
```

Add `NotificationDispatcher` to the `exports` array.

- [x] **Step 6: Verify the module compiles**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS (no type errors).

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/communication/notification-dispatcher.service.ts apps/backend/src/modules/communication/communication.module.ts apps/backend/src/modules/communication/email-notifications.service.test.ts
git commit -m "feat(backend): NotificationDispatcher + communication module wiring (Noop default)"
```

---

## Task 6: Wire enrollment events → emails (invited + completed)

**Files:**

- Create: `apps/backend/src/modules/mvp/enrollment-invited.event.ts`
- Create: `apps/backend/src/modules/mvp/enrollment-recipient.ts` (pure helper — resolves a `Learner` to a recipient; unit-testable without `MvpService`)
- Create: `apps/backend/src/modules/mvp/enrollment-recipient.test.ts`
- Modify: `apps/backend/src/modules/mvp/enrollment-completed.event.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (emit invited in `createEnrollment`; add `recipient` to the `enrollment_completed` emit)
- Create: `apps/backend/src/modules/communication/enrollment-email.listener.ts`
- Modify: `apps/backend/src/modules/communication/communication.module.ts` (register listener)
- Test: `apps/backend/src/modules/communication/email-notifications.service.test.ts` (append — listener)

- [x] **Step 1: Add the `recipient` field to the completed-event payload**

In `apps/backend/src/modules/mvp/enrollment-completed.event.ts`, add to the `EnrollmentCompletedPayload` interface (keep optional for backward compatibility):

```ts
  /** Resolved learner contact for Phase 5 email (producer-resolved, spec §3.1). */
  recipient?: { email: string; name?: string };
```

- [x] **Step 2: Create the invited event**

Create `apps/backend/src/modules/mvp/enrollment-invited.event.ts`:

```ts
export const ENROLLMENT_INVITED_EVENT = 'learning.enrollment_invited' as const;

export interface EnrollmentInvitedPayload {
  tenantId: string;
  enrollmentId: string;
  learnerId: string;
  groupId: string;
  /** Resolved learner contact; absent if the learner has no e-mail on file. */
  recipient?: { email: string; name?: string };
  actorId?: string;
  requestId?: string;
  correlationId?: string;
}
```

- [x] **Step 3: Write the failing listener test**

Append to `email-notifications.service.test.ts`:

```ts
import { ENROLLMENT_INVITED_EVENT } from '../mvp/enrollment-invited.event.js';
import { ENROLLMENT_COMPLETED_EVENT } from '../mvp/enrollment-completed.event.js';
import { EnrollmentEmailListener } from './enrollment-email.listener.js';

describe('EnrollmentEmailListener', () => {
  it('dispatches enrollment_invite on the invited event', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    const listener = new EnrollmentEmailListener(dispatcher);
    await listener.handleInvited({
      tenantId: 't1',
      enrollmentId: 'enr1',
      learnerId: 'l1',
      groupId: 'g1',
      recipient: { email: 'a@example.com', name: 'Иванов' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.total).toBe(1);
    expect(list.items[0]!.templateKey).toBe('enrollment_invite');
    expect(list.items[0]!.relatedEntityId).toBe('enr1');
  });

  it('does nothing when the payload has no recipient e-mail', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    const listener = new EnrollmentEmailListener(dispatcher);
    await listener.handleInvited({
      tenantId: 't1',
      enrollmentId: 'enr1',
      learnerId: 'l1',
      groupId: 'g1'
    });
    expect((await deliveries.list('t1', {})).total).toBe(0);
  });

  it('dispatches course_completed on the completed event', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    const listener = new EnrollmentEmailListener(dispatcher);
    await listener.handleCompleted({
      tenantId: 't1',
      enrollmentId: 'enr1',
      learnerId: 'l1',
      groupId: 'g1',
      groupCourseIds: [],
      recipient: { email: 'a@example.com', name: 'Иванов' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.items[0]!.templateKey).toBe('course_completed');
  });
});
```

- [x] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./enrollment-email.listener.js`.

- [x] **Step 5: Implement the listener**

Create `apps/backend/src/modules/communication/enrollment-email.listener.ts` (mirrors `enrollment-document-issuance.listener.ts`: `@Injectable` + `@OnEvent({ async: true })` + `setImmediate` fire-and-forget; the handler is a thin sync entrypoint and the work is awaited inside):

```ts
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { NotificationDispatcher } from './notification-dispatcher.service.js';
import {
  ENROLLMENT_COMPLETED_EVENT,
  type EnrollmentCompletedPayload
} from '../mvp/enrollment-completed.event.js';
import {
  ENROLLMENT_INVITED_EVENT,
  type EnrollmentInvitedPayload
} from '../mvp/enrollment-invited.event.js';

@Injectable()
export class EnrollmentEmailListener {
  constructor(private readonly dispatcher: NotificationDispatcher) {}

  @OnEvent(ENROLLMENT_INVITED_EVENT, { async: true })
  handleInvited(payload: EnrollmentInvitedPayload): Promise<void> {
    return this.dispatch(payload, 'enrollment_invite');
  }

  @OnEvent(ENROLLMENT_COMPLETED_EVENT, { async: true })
  handleCompleted(payload: EnrollmentCompletedPayload): Promise<void> {
    return this.dispatch(payload, 'course_completed');
  }

  private async dispatch(
    payload: {
      tenantId: string;
      enrollmentId: string;
      recipient?: { email: string; name?: string };
    },
    templateKey: 'enrollment_invite' | 'course_completed'
  ): Promise<void> {
    if (!payload.recipient?.email) {
      return;
    }
    await this.dispatcher.dispatch({
      tenantId: payload.tenantId,
      templateKey,
      recipients: [
        {
          email: payload.recipient.email,
          ...(payload.recipient.name ? { name: payload.recipient.name } : {}),
          kind: 'learner'
        }
      ],
      variables: {
        learnerName: payload.recipient.name ?? '',
        courseTitle: ''
      },
      relatedEntityType: 'learning.enrollment',
      relatedEntityId: payload.enrollmentId
    });
  }
}
```

> `courseTitle` is left empty here because the enrollment links to a _group_, not a single course. If a richer subject is wanted, resolve the title at the producer and add it to the payload — out of scope for 5A's "prove the wiring" goal.

- [x] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: PASS (listener cases).

- [x] **Step 7: Register the listener**

In `communication.module.ts`, import `EnrollmentEmailListener` and add it to the `providers` array (plain singleton — exactly like `EnrollmentDocumentIssuanceListener` in `documents.module.ts`):

```ts
import { EnrollmentEmailListener } from './enrollment-email.listener.js';
// ...in providers: [...]
    EnrollmentEmailListener,
```

- [x] **Step 8: Create the recipient helper + emit the invited event**

Create `apps/backend/src/modules/mvp/enrollment-recipient.ts` (pure — extracts the only non-trivial part of the emit so it is unit-testable without `MvpService`):

```ts
import type { Learner } from './mvp.types.js';

export interface ResolvedRecipient {
  email: string;
  name: string;
}

/** Resolve a learner to an e-mail recipient, or undefined when no e-mail is on file. */
export function learnerRecipient(learner: Learner | undefined): ResolvedRecipient | undefined {
  if (!learner?.email) {
    return undefined;
  }
  return { email: learner.email, name: `${learner.lastName} ${learner.firstName}`.trim() };
}
```

In `apps/backend/src/modules/mvp/mvp.service.ts`, add the imports near the other event import (`./enrollment-completed.event.js`):

```ts
import { ENROLLMENT_INVITED_EVENT } from './enrollment-invited.event.js';
import { learnerRecipient } from './enrollment-recipient.js';
```

In `createEnrollment`, immediately **before** `return entity;` (after the `this.audit(...)` call), add:

```ts
const invitedRecipient = learnerRecipient(
  this.state.learners.find((l) => l.tenantId === tenantId && l.id === entity.learnerId)
);
this.events.emit(ENROLLMENT_INVITED_EVENT, {
  tenantId,
  enrollmentId: entity.id,
  learnerId: entity.learnerId,
  groupId: entity.groupId,
  ...(invitedRecipient ? { recipient: invitedRecipient } : {}),
  actorId,
  requestId: context.requestId,
  correlationId: context.correlationId
});
```

> This single emit covers BOTH the single-enrollment HTTP path and the bulk path — `createBulkEnrollments` calls `createEnrollment` per learner (mvp.service.ts ~line 1673), and duplicate rows throw `ConflictException` before reaching this point, so no double-emit.

- [x] **Step 9: Add `recipient` to the completed-event emit**

In `mvp.service.ts`, at the existing `this.events.emit(ENROLLMENT_COMPLETED_EVENT, {...})` call (inside `updateEnrollmentStatus`, ~line 1788), reuse the helper. Just before the emit, add:

```ts
const completedRecipient = learnerRecipient(
  this.state.learners.find((l) => l.tenantId === tenantId && l.id === enrollment.learnerId)
);
```

Then add this property inside the emitted object literal:

```ts
        ...(completedRecipient ? { recipient: completedRecipient } : {}),
```

- [x] **Step 10: Verify types + the existing MVP enrollment tests still pass**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 11: Write + run the recipient-helper unit test**

This covers the resolution logic (the only non-trivial part of the emit) completely, with no `MvpService` needed. Create `apps/backend/src/modules/mvp/enrollment-recipient.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { learnerRecipient } from './enrollment-recipient.js';

import type { Learner } from './mvp.types.js';

function learner(partial: Partial<Learner>): Learner {
  return {
    id: 'l1',
    tenantId: 't1',
    firstName: 'Иван',
    lastName: 'Иванов',
    status: 'active',
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...partial
  } as Learner;
}

describe('learnerRecipient', () => {
  it('builds "Фамилия Имя" + email when an e-mail is present', () => {
    expect(learnerRecipient(learner({ email: 'ivan@example.com' }))).toEqual({
      email: 'ivan@example.com',
      name: 'Иванов Иван'
    });
  });

  it('returns undefined when the learner has no e-mail', () => {
    expect(learnerRecipient(learner({ email: undefined }))).toBeUndefined();
  });

  it('returns undefined when the learner is undefined', () => {
    expect(learnerRecipient(undefined)).toBeUndefined();
  });
});
```

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/enrollment-recipient.test.ts --no-file-parallelism`
Expected: PASS (3 cases). The end-to-end emit wiring is additionally exercised by the canonical enrollment e2e flow (`business-flows.e2e.test.ts`) once the listener is registered.

- [x] **Step 12: Commit**

```bash
git add apps/backend/src/modules/mvp/enrollment-invited.event.ts apps/backend/src/modules/mvp/enrollment-recipient.ts apps/backend/src/modules/mvp/enrollment-recipient.test.ts apps/backend/src/modules/mvp/enrollment-completed.event.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/communication/enrollment-email.listener.ts apps/backend/src/modules/communication/communication.module.ts apps/backend/src/modules/communication/email-notifications.service.test.ts
git commit -m "feat(backend): wire enrollment invited/completed events to learner emails"
```

---

## Task 7: Emit `documents.revoked` (e-mail listener deferred to 5B)

**Files:**

- Create: `apps/backend/src/modules/documents/document-revoked.event.ts`
- Modify: `apps/backend/src/modules/documents/documents.service.ts` (inject `EventEmitter2`; emit)
- Modify: `apps/backend/src/modules/documents/documents.service.test.ts` (add one emit test)

> `DocumentsService` does NOT currently inject `EventEmitter2` and is request-scoped. Injecting the root-singleton `EventEmitter2` into a request-scoped provider is safe. The new param is made **optional** (`@Optional()`), so the ~20 existing 3-arg `new DocumentsService(...)` test call-sites keep compiling unchanged — mirroring how `LicensesService` is `@Optional()` in `MvpService`.

- [x] **Step 1: Create the event**

Create `apps/backend/src/modules/documents/document-revoked.event.ts`:

```ts
export const DOCUMENT_REVOKED_EVENT = 'documents.revoked' as const;

export interface DocumentRevokedPayload {
  tenantId: string;
  documentId: string;
  /** Source entity the document was issued for (e.g. 'enrollment' + enrollmentId) — used by the 5B listener to resolve the learner recipient. */
  sourceEntityType?: string;
  sourceEntityId?: string;
  reason: string;
  actorId?: string;
  revokedAt?: string;
  requestId?: string;
  correlationId?: string;
}
```

- [x] **Step 2: Write the failing emit test**

In `apps/backend/src/modules/documents/documents.service.test.ts`, add these imports at the top:

```ts
import { EventEmitter2 } from '@nestjs/event-emitter';

import { DOCUMENT_REVOKED_EVENT } from './document-revoked.event.js';
```

Add this test inside the existing `describe('DocumentsService.revokeDocument (Plan C §5.9)', ...)` block (it mirrors that block's `seed()` exactly — the same `gdoc_revtest` row — but passes a real `EventEmitter2` as the new 4th constructor arg so the emit can be captured):

```ts
it('emits documents.revoked when a document is revoked', async () => {
  const state = new InMemoryDocumentsState();
  const events = new EventEmitter2();
  const service = new DocumentsService(
    state,
    new AuditService(),
    new RealtimeEventsService(),
    events
  );
  state.generatedDocuments.push({
    id: 'gdoc_revtest',
    tenantId: 't1',
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'certificate',
    name: 'Doc',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr',
    fileId: 'f',
    status: 'generated',
    documentNumber: 'N-1',
    documentDate: '2026-05-26',
    isFinal: false,
    generatedAt: '2026-05-26T00:00:00.000Z',
    qrToken: 'rev_qrtoken1234567890ab'
  });
  const captured: Array<{ reason: string; documentId: string; sourceEntityId?: string }> = [];
  events.on(DOCUMENT_REVOKED_EVENT, (p) =>
    captured.push(p as { reason: string; documentId: string; sourceEntityId?: string })
  );

  await service.revokeDocument('t1', 'admin_1', 'gdoc_revtest', 'Ошибка в ФИО', ctx);

  expect(captured).toHaveLength(1);
  expect(captured[0]!.reason).toBe('Ошибка в ФИО');
  expect(captured[0]!.documentId).toBe('gdoc_revtest');
  expect(captured[0]!.sourceEntityId).toBe('enr');
});
```

(`InMemoryDocumentsState`, `AuditService`, `RealtimeEventsService`, and the shared `ctx` are already imported/defined in this file — they back the block's existing `seed()` helper.)

- [x] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
Expected: FAIL — `DOCUMENT_REVOKED_EVENT` not emitted (and/or constructor arity).

- [x] **Step 4: Inject EventEmitter2 (optional) + emit**

In `documents.service.ts`, add the imports (and ensure `Inject`, `Optional` are imported from `@nestjs/common`):

```ts
import { EventEmitter2 } from '@nestjs/event-emitter';

import { DOCUMENT_REVOKED_EVENT } from './document-revoked.event.js';
```

Add an **optional** EventEmitter2 as the last constructor parameter (optional so the ~20 existing 3-arg `new DocumentsService(...)` call-sites keep compiling):

```ts
    @Optional() @Inject(EventEmitter2) private readonly events?: EventEmitter2
```

In `revokeDocument`, immediately **before** `return doc;` (after the `await this.auditService.writeCritical(...)` call), add the guarded emit:

```ts
this.events?.emit(DOCUMENT_REVOKED_EVENT, {
  tenantId,
  documentId,
  sourceEntityType: doc.sourceEntityType,
  sourceEntityId: doc.sourceEntityId,
  reason: doc.revocationReason,
  actorId,
  revokedAt: doc.revokedAt,
  requestId: ctx.requestId,
  correlationId: ctx.correlationId
});
```

> `this.events?.` guards the optional: in production DI provides the singleton `EventEmitter2`; in the existing 3-arg tests it's undefined and the emit is a harmless no-op.

- [x] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
Expected: PASS — the new emit test plus all pre-existing revoke cases (which still pass because `events` is optional and they omit it).

- [x] **Step 6: Verify types**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/document-revoked.event.ts apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "feat(backend): emit documents.revoked event (email listener lands in 5B)"
```

---

## Task 8: Admin endpoints + permission-boundary test

**Files:**

- Create: `apps/backend/src/modules/communication/upsert-email-template.dto.ts`
- Create: `apps/backend/src/modules/communication/email-notifications.controller.ts`
- Modify: `apps/backend/src/modules/communication/communication.module.ts` (register controller)
- Modify: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` (add notifications permission-boundary `describe` block — per CLAUDE.md, extend this file)

- [x] **Step 1: Create the DTO**

Create `apps/backend/src/modules/communication/upsert-email-template.dto.ts`:

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertEmailTemplateRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}
```

- [x] **Step 2: Create the controller**

Create `apps/backend/src/modules/communication/email-notifications.controller.ts` (class-level `@Controller()` + `@UseGuards(TenantGuard)`; per-method `@UseGuards(PermissionGuard)` + `@RequirePermissions(...)`; `@Body() raw: unknown` + `assertValidDto`, exactly as `mvp.controller.ts` does):

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  UseGuards
} from '@nestjs/common';

import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import {
  EMAIL_DELIVERIES_REPOSITORY,
  type EmailDeliveriesRepository
} from './email-deliveries.repository.js';
import { EMAIL_TEMPLATE_DEFAULTS, type EmailTemplateKey } from './email-templates.js';
import {
  EMAIL_TEMPLATES_REPOSITORY,
  type EmailTemplatesRepository
} from './email-templates.repository.js';
import { UpsertEmailTemplateRequest } from './upsert-email-template.dto.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

const KNOWN_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_DEFAULTS) as EmailTemplateKey[];

@Controller()
@UseGuards(TenantGuard)
export class EmailNotificationsController {
  constructor(
    @Inject(EMAIL_TEMPLATES_REPOSITORY) private readonly templates: EmailTemplatesRepository,
    @Inject(EMAIL_DELIVERIES_REPOSITORY) private readonly deliveries: EmailDeliveriesRepository
  ) {}

  @Get('email-deliveries')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.read')
  async listDeliveries(@CurrentContext() c: RequestContext) {
    return this.deliveries.list(c.tenantId!, {});
  }

  @Get('email-templates')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.read')
  async listTemplates(@CurrentContext() c: RequestContext) {
    const overrides = await this.templates.listOverrides(c.tenantId!);
    return {
      items: KNOWN_TEMPLATE_KEYS.map((key) => {
        const override = overrides.find((o) => o.templateKey === key);
        const base = override ?? EMAIL_TEMPLATE_DEFAULTS[key];
        return {
          templateKey: key,
          subject: base.subject,
          body: base.body,
          overridden: Boolean(override)
        };
      })
    };
  }

  @Put('email-templates/:key')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.write')
  async upsertTemplate(
    @CurrentContext() c: RequestContext,
    @Param('key') key: string,
    @Body() raw: unknown
  ) {
    if (!KNOWN_TEMPLATE_KEYS.includes(key as EmailTemplateKey)) {
      throw new BadRequestException({
        code: 'unknown_template_key',
        message: `Unknown template: ${key}`
      });
    }
    const body = assertValidDto(UpsertEmailTemplateRequest, raw);
    return this.templates.upsertOverride(c.tenantId!, key as EmailTemplateKey, {
      subject: body.subject,
      body: body.body,
      ...(c.userId ? { updatedBy: c.userId } : {})
    });
  }
}
```

- [x] **Step 3: Register the controller**

In `communication.module.ts`, import `EmailNotificationsController` and add it to the `controllers` array.

- [x] **Step 4: Verify types**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Write the failing permission-boundary test**

In `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`, add two handlers to the existing `TestMvpController` stub class:

```ts
      @Get('email-deliveries')
      @RequirePermissions('notifications.read')
      listEmailDeliveries(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], total: 0, tenantId: context.tenantId };
      }

      @Put('email-templates/:key')
      @RequirePermissions('notifications.write')
      upsertEmailTemplate(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { subject: string; body: string }
      ) {
        return { templateKey: 'enrollment_invite', updatedBy: context.userId, subject: body.subject };
      }
```

> `Put` must be added to the destructured `nestjs/common` imports inside `beforeAll` (alongside `Get`/`Post`/`Patch`).

Then add a new `describe` block near the other permission-boundary blocks (with its own `beforeEach` reset, per the file's convention):

```ts
describe('notifications permission boundary', () => {
  beforeEach(() => {
    iamServiceMock.resolvePermissions.mockReset();
    iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
  });

  it('returns permission_denied for GET /email-deliveries without notifications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['courses.read']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/email-deliveries`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success for GET /email-deliveries with notifications.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['notifications.read']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/email-deliveries`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { tenantId: string };
      meta: { requestId: string };
    };
    expect(payload.data.tenantId).toBe('tenant_demo');
  });

  it('returns permission_denied for PUT /email-templates/:key without notifications.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['notifications.read']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/email-templates/enrollment_invite`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ subject: 'S', body: 'B' })
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('returns success for PUT /email-templates/:key with notifications.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['notifications.write']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/email-templates/enrollment_invite`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ subject: 'Custom', body: 'Body' })
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { subject: string };
      meta: { requestId: string };
    };
    expect(payload.data.subject).toBe('Custom');
  });
});
```

- [x] **Step 6: Run the test to verify it fails, then passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: first run FAIL (stub handlers/imports missing), then PASS after Step 5 edits are complete.

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/communication/upsert-email-template.dto.ts apps/backend/src/modules/communication/email-notifications.controller.ts apps/backend/src/modules/communication/communication.module.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): notifications admin endpoints + permission-boundary test"
```

---

## Task 9: Full-suite verification + docs handoff

**Files:**

- Modify: `README.md` (§2 «AI Agent State»)
- Modify: `LMS_AGENT_HANDOFF.md` (append §5.XX)
- Modify: `docs/superpowers/plans/2026-06-04-phase-5-plan-a-notification-foundation.md` (tick boxes)

- [x] **Step 1: Lint the new files**

Run: `npx eslint apps/backend/src/infrastructure/mailer apps/backend/src/modules/communication --max-warnings=0`
Expected: PASS (no warnings). Fix any issues.

- [x] **Step 2: Typecheck the whole monorepo**

Run: `pnpm typecheck`
Expected: PASS.

- [x] **Step 3: Run the targeted backend suites (Cyrillic-path safe — isolated files)**

Run each and expect PASS:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/mailer/mailer.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/mailer/smtp-mailer.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
```

> Per CLAUDE.md Gotchas, do NOT run the full `pnpm test:backend` locally (Cyrillic-path `tinypool` crash). CI (Ubuntu) runs the full suite.

- [x] **Step 4: Update docs**

In `README.md` §2 «AI Agent State», set Last Completed Task = «Phase 5 Plan 5A — notification foundation», Current/Next per remaining work (5B). Append a `### 5.XX` entry to `LMS_AGENT_HANDOFF.md` §5 with: summary, files changed, test status, deviations (document-revoked email deferred to 5B; `course_completed` folds the spec's separate document-issued mail; new HTTP test added to mvp file per CLAUDE.md). Cross-link this plan and tick its checkboxes.

- [x] **Step 5: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-04-phase-5-plan-a-notification-foundation.md
git commit -m "docs(plan): close out Phase 5 Plan 5A — notification foundation"
```

---

## Deviations from the spec (record any new ones in the handoff)

1. **`document_issued` mail folded into `course_completed`** — issuance happens on completion, so 5A sends one completion mail mentioning the documents, avoiding a documents→communication module dependency. A distinct issued-mail can be added later if the product wants it.
2. **`documents.revoked` e-mail deferred to 5B** — the event is emitted in 5A, but notifying the learner needs an enrollment→learner recipient resolver that 5B builds. No listener on the event in 5A.
3. **Permission-boundary test added to `mvp.http.integration.test.ts`** (not a new communication-module file) — per CLAUDE.md «extend that file rather than creating new ones for permission-only tests».
4. **Migration combines tables + permissions** in one file (`0047`) rather than splitting DDL and IAM — both are one coherent 5A change; precedent exists (e.g. `0030`).
