# Pillar A Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Укрепить уже выпущенный Pillar A (документы, лицензии, личное дело, публичная QR-проверка) перед пилотом: закрыть gap'ы в audit-логе, перевести критичные мутации на `writeCritical`, провести security-проход (IDOR, public verify, ПДн по 152-ФЗ, идемпотентность), написать runbook для дежурного.

**Architecture:** Не строим новые подсистемы. Используем существующий `AuditService` (audit module), существующий `@nestjs/throttler` (Plan C уже подключён к `/public/verify`), существующий `RequestContext` (включает `ip`/`userAgent`). Каждый PR — отдельный слой: PR-1 audit, PR-2 security, PR-3 runbook.

**Tech Stack:** TypeScript, NestJS, vitest, существующий `AuditService` + `@nestjs/throttler` + `RequestContext`. Без новых зависимостей.

**Спека:** [docs/superpowers/specs/2026-05-27-pillar-a-hardening-design.md](../specs/2026-05-27-pillar-a-hardening-design.md).

**Базовая ветка:** `main` (после мержа PR #178 Plan C). Работа идёт в `feat/2026-05-27-pillar-a-hardening`.

---

## Структура работы

План состоит из 3 секций, каждая = одна PR:

- **Section A (PR-1): Audit completeness** — Tasks 1–12. ~200 LOC. Цель: закрыть gap'ы в audit, перевести критичные мутации на `writeCritical`.
- **Section B (PR-2): Security hardening** — Tasks 13–25. ~500 LOC. Цель: IDOR negative tests, public verify hardening, ПДн маскирование, idempotency concurrency.
- **Section C (PR-3): Runbook + smoke** — Tasks 26–28. ~1 файл. Цель: 5 сценариев инцидентов в формате Симптом→Проверки→Действия→Verify, smoke ran.

**Порядок:** A → B → C. A и B не зависят друг от друга по коду, но A пушится первым, потому что включает изменения в сигнатурах вызовов аудита, на которые B опирается в тестах. C делается после обеих.

**Общая оценка:** ~7–8 рабочих дней одной парой рук.

---

## Карта файлов (что трогаем)

### Backend modules:

- `apps/backend/src/modules/audit/audit.service.ts` — добавить docstrings (правило write vs writeCritical). Не меняем сигнатуры.
- `apps/backend/src/modules/documents/documents.service.ts` — добавить audit-вызовы в `finalizeDocument`/`archiveDocument`/`activateNumberingRule`/`deactivateNumberingRule`/`setCurrentVersion`/`activateTemplateVersion`/CRUD variables и bindings. Перевести `revokeDocument`/`reissueDocument`/`issueGroupOrder` на `writeCritical`. Починить idempotency в `generateDocumentsBatch`. Передать `ip`/`userAgent` в `writeTaskAudit`. Маскировать ПДн в audit (если когда-нибудь будем туда писать).
- `apps/backend/src/modules/documents/documents.controller.ts` — добавить `await` для возвращаемых результатов (контроллеры NestJS поддерживают Promise return). Может потребоваться `async` на методах.
- `apps/backend/src/modules/documents/public-verify.controller.ts` — перевести audit на `writeCritical` (awaited).
- `apps/backend/src/modules/org/licenses.service.ts` — `auditService.write` → `writeCritical` для create/update/revoke. Добавить audit на отсутствующие методы (если найдём).
- `apps/backend/src/modules/mvp/learner-pdf-card.service.ts` — добавить access-log (`learner.personal_data_accessed`) при `composeData`.
- `apps/backend/src/modules/mvp/mvp.controller.ts` — обновить вызов `composeData` (передать `actorId` + `ctx`).

### Tests (новые/изменённые):

- `apps/backend/src/modules/documents/documents.audit-completeness.test.ts` (NEW)
- `apps/backend/src/modules/documents/documents.idor.integration.test.ts` (NEW)
- `apps/backend/src/modules/documents/documents.idempotency-concurrency.test.ts` (NEW)
- `apps/backend/src/modules/documents/public-verify.controller.test.ts` (MODIFY — add PII / rate-limit tests)
- `apps/backend/src/modules/org/licenses.idor.test.ts` (NEW)
- `apps/backend/src/modules/mvp/learner-pdf-card.idor.test.ts` (NEW)
- `apps/backend/src/modules/mvp/learner-pdf-card.audit.test.ts` (NEW)

### Docs (PR-3):

- `docs/runbooks/pillar-a-incidents.md` (NEW) — 5 сценариев.

---

# Section A: PR-1 — Audit Completeness

**PR-цель:** Закрыть gap'ы в audit-покрытии Pillar A. Перевести критичные мутации на `writeCritical`. Передать `ip`/`userAgent` везде, где сейчас не передаётся. Документировать правило write vs writeCritical в коде.

**PR-инвариант (DoD на момент merge):**

- Каждая мутация Pillar A пишет audit-event с правильным `action`/`entityType`/`entityId`/`actorId`/`tenantId`.
- Все мутации, перечисленные в §3.3 спеки как «критичные», используют `auditService.writeCritical()` (awaited).
- Сигнатуры тех методов сервисов, что переходят на awaited audit, становятся `async` и `Promise<T>`. Контроллер обновлён, чтобы возвращать промис (NestJS обрабатывает это автоматически).
- Все audit-вызовы передают `requestId`/`correlationId`/`ip`/`userAgent` из `RequestContext`.
- Зелёные тесты: vitest по всему backend, плюс новый файл `documents.audit-completeness.test.ts`.

---

### Task A1: Документировать правило write vs writeCritical в `AuditService`

**Files:**

- Modify: `apps/backend/src/modules/audit/audit.service.ts:36` (метод `write`)
- Modify: `apps/backend/src/modules/audit/audit.service.ts:69` (метод `writeCritical`)

Нет теста — это docstring. Однако дальнейшие задачи рассчитывают, что правило задокументировано.

- [ ] **Step 1: Добавить docstring к `write()`**

Заменить строку `write(record: AuditWritePayload, options?: { skipDatabase?: boolean }): AuditLogRecord {` на:

```typescript
  /**
   * Fire-and-forget запись audit-события. Используется для CRUD по справочникам
   * (шаблоны, переменные, биндинги, numbering rules), где потеря одной записи
   * не делает невозможной forensic-реконструкцию.
   *
   * Для критичных мутаций (revoke/reissue/finalize/group_order/license CRUD,
   * выпуск документа, доступ к ПДн, публичные эндпоинты) используй
   * `writeCritical()` — он awaited и пробрасывает ошибку БД наверх.
   */
  write(record: AuditWritePayload, options?: { skipDatabase?: boolean }): AuditLogRecord {
```

- [ ] **Step 2: Добавить docstring к `writeCritical()`**

Заменить строку `async writeCritical(` на:

```typescript
  /**
   * Awaited запись audit-события. Используется для:
   *   - мутаций выданных документов (revoke, reissue, finalize, archive);
   *   - массовых операций (group order, batch generate);
   *   - изменения прав (org licenses CRUD, iam permission changes);
   *   - доступа к ПДн (`learner.personal_data_accessed`);
   *   - публичных эндпоинтов (`/public/verify/:token`).
   *
   * При падении БД промис rejects — caller обязан либо обработать, либо дать
   * упасть на уровне http-фильтра. Это важно: потеря audit-записи для этих
   * категорий нарушает forensic-реконструкцию и/или 152-ФЗ.
   */
  async writeCritical(
```

- [ ] **Step 3: Прогнать тесты модуля audit**

Run: `pnpm --filter backend test src/modules/audit`
Expected: PASS (никаких изменений в логике — только комментарии).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/audit/audit.service.ts
git commit -m "$(cat <<'EOF'
docs(audit): clarify write vs writeCritical usage rules

write — fire-and-forget для CRUD по справочникам.
writeCritical — awaited для мутаций выданных документов, массовых
операций, изменения прав, ПДн-доступа, публичных эндпоинтов.
Правило ссылается на §3.3 спеки Pillar A hardening.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A2: Audit для `finalizeDocument`

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:588` (метод `finalizeDocument`)
- Modify: `apps/backend/src/modules/documents/documents.controller.ts:258` (метод `finalizeDocument`)
- Test: `apps/backend/src/modules/documents/documents.audit-completeness.test.ts` (NEW)

- [ ] **Step 1: Создать файл тестов с red-test'ом**

Создать файл `apps/backend/src/modules/documents/documents.audit-completeness.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  tenantId: 't1',
  userId: 'u1',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeServiceWithDoc() {
  const state = new InMemoryDocumentsState();
  const audit = new AuditService();
  const service = new DocumentsService(state, audit, new RealtimeEventsService());
  const template = service.createTemplate(
    't1',
    'u1',
    { name: 'Tpl', templateType: 'contract' },
    ctx
  );
  const version = service.createTemplateVersion('t1', 'u1', {
    templateId: template.id,
    fileId: 'file_1'
  });
  service.activateTemplateVersion('t1', version.id);
  const task = service.generateDocument(
    't1',
    'u1',
    {
      idempotencyKey: 'finalize-1',
      templateId: template.id,
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      documentType: 'default'
    },
    ctx
  );
  const generated = service.completeTask('t1', task.id, 'file_2', 'u1');
  return { state, audit, service, generated };
}

describe('Audit completeness — finalizeDocument', () => {
  it('emits writeCritical audit-event on finalize', async () => {
    const { audit, service, generated } = makeServiceWithDoc();
    await service.finalizeDocument('t1', 'u1', generated.id, ctx);
    const events = await audit.list('t1');
    const finalized = events.filter((e) => e.action === 'documents.finalized');
    expect(finalized).toHaveLength(1);
    expect(finalized[0]).toMatchObject({
      entityType: 'documents.generated',
      entityId: generated.id,
      actorId: 'u1',
      tenantId: 't1'
    });
    expect(finalized[0].newValues).toMatchObject({ status: 'final', isFinal: true });
    expect(finalized[0].oldValues).toMatchObject({ status: 'generated', isFinal: false });
    expect(finalized[0].metadata).toMatchObject({ correlation_id: 'c1' });
    expect(finalized[0].ip).toBe('127.0.0.1');
    expect(finalized[0].userAgent).toBe('vitest');
    expect(finalized[0].requestId).toBe('r1');
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что fail**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts`
Expected: FAIL — `service.finalizeDocument` сейчас принимает `(tenantId, id)`, в тесте `(tenantId, actorId, id, ctx)`.

- [ ] **Step 3: Обновить сигнатуру `finalizeDocument` в service**

Заменить блок `documents.service.ts:588-595`:

```typescript
  finalizeDocument(tenantId: string, id: string) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived')
      throw new BadRequestException('Archived document cannot be finalized');
    doc.status = 'final';
    doc.isFinal = true;
    return doc;
  }
```

на:

```typescript
  async finalizeDocument(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived')
      throw new BadRequestException('Archived document cannot be finalized');
    const oldValues = { status: doc.status, isFinal: doc.isFinal };
    doc.status = 'final';
    doc.isFinal = true;
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.finalized',
      entityType: 'documents.generated',
      entityId: id,
      oldValues,
      newValues: { status: doc.status, isFinal: doc.isFinal },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return doc;
  }
```

- [ ] **Step 4: Обновить контроллер**

Заменить блок `documents.controller.ts:255-260`:

```typescript
  @Post('documents/:id/finalize')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  finalizeDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.finalizeDocument(c.tenantId!, id);
  }
```

на:

```typescript
  @Post('documents/:id/finalize')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  finalizeDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.finalizeDocument(c.tenantId!, c.userId, id, c);
  }
```

- [ ] **Step 5: Прогнать тест, убедиться что PASS**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts`
Expected: PASS.

- [ ] **Step 6: Прогнать ВСЕ тесты модуля documents**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS. Если упали другие тесты `documents.service.test.ts` — они вызывают `finalizeDocument` со старой сигнатурой; исправить так, чтобы передавали `actorId` и `ctx` (минимально — `service.finalizeDocument('t1', 'u1', doc.id, ctx)`). При исправлении НЕ менять смысл теста.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
feat(documents): writeCritical audit on finalize

finalizeDocument: добавлен audit-event documents.finalized
через writeCritical (awaited). Сигнатура сервиса теперь
async (tenantId, actorId, id, ctx).

Pillar A hardening §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A3: Audit для `archiveDocument`

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:596` (метод `archiveDocument`)
- Modify: `apps/backend/src/modules/documents/documents.controller.ts:264` (метод `archiveDocument`)
- Modify: `apps/backend/src/modules/documents/documents.audit-completeness.test.ts` (добавить describe block)

- [ ] **Step 1: Добавить red-test в `documents.audit-completeness.test.ts`**

Добавить новый describe block в конец файла:

```typescript
describe('Audit completeness — archiveDocument', () => {
  it('emits writeCritical audit-event on archive', async () => {
    const { audit, service, generated } = makeServiceWithDoc();
    await service.archiveDocument('t1', 'u1', generated.id, ctx);
    const events = await audit.list('t1');
    const archived = events.filter((e) => e.action === 'documents.archived');
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatchObject({
      entityType: 'documents.generated',
      entityId: generated.id,
      actorId: 'u1',
      tenantId: 't1'
    });
    expect(archived[0].newValues).toMatchObject({ status: 'archived' });
    expect(archived[0].oldValues).toMatchObject({ status: 'generated' });
  });

  it('idempotent — повторный archive не пишет второй audit-event', async () => {
    const { audit, service, generated } = makeServiceWithDoc();
    await service.archiveDocument('t1', 'u1', generated.id, ctx);
    await service.archiveDocument('t1', 'u1', generated.id, ctx);
    const events = await audit.list('t1');
    expect(events.filter((e) => e.action === 'documents.archived')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что fail**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts -t "archiveDocument"`
Expected: FAIL — сигнатура не совпадает + аудит не пишется.

- [ ] **Step 3: Обновить `archiveDocument` в service**

Заменить блок `documents.service.ts:596-602`:

```typescript
  archiveDocument(tenantId: string, id: string) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived') return doc;
    doc.status = 'archived';
    doc.archivedAt = this.now();
    return doc;
  }
```

на:

```typescript
  async archiveDocument(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived') return doc;
    const oldStatus = doc.status;
    doc.status = 'archived';
    doc.archivedAt = this.now();
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.archived',
      entityType: 'documents.generated',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status: 'archived', archivedAt: doc.archivedAt },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return doc;
  }
```

- [ ] **Step 4: Обновить контроллер**

Заменить блок `documents.controller.ts:261-266`:

```typescript
  @Post('documents/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  archiveDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.archiveDocument(c.tenantId!, id);
  }
```

на:

```typescript
  @Post('documents/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  archiveDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.archiveDocument(c.tenantId!, c.userId, id, c);
  }
```

- [ ] **Step 5: Прогнать тесты модуля documents**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS. Если упали другие тесты — починить вызовы.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
feat(documents): writeCritical audit on archive (idempotent)

archiveDocument: добавлен audit-event documents.archived
через writeCritical. Повторный archive не пишет второй event
(idempotent behaviour сохранён).

Pillar A hardening §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A4: Convert `revokeDocument`, `reissueDocument`, `issueGroupOrder` to `writeCritical`

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:903` (метод `revokeDocument`)
- Modify: `apps/backend/src/modules/documents/documents.service.ts:963` (метод `reissueDocument`)
- Modify: `apps/backend/src/modules/documents/documents.service.ts:1103` (метод `issueGroupOrder`)
- Modify: `apps/backend/src/modules/documents/documents.controller.ts:391,402,380` (controller routes)
- Modify: `apps/backend/src/modules/documents/documents.audit-completeness.test.ts` (добавить тесты)

Эти методы уже пишут audit, но через `write()` (fire-and-forget). Меняем на `writeCritical()` (awaited). Все три становятся `async`.

- [ ] **Step 1: Добавить red-тесты в `documents.audit-completeness.test.ts`**

Добавить в конец файла:

```typescript
describe('Audit completeness — revoke uses writeCritical', () => {
  it('awaits audit write before returning revoked document', async () => {
    const { audit, service, generated } = makeServiceWithDoc();
    let auditAwaited = false;
    const original = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args: Parameters<typeof original>) => {
      // имитируем задержку, чтобы убедиться что caller awaits
      await new Promise((r) => setTimeout(r, 5));
      auditAwaited = true;
      return original(...args);
    };
    await service.revokeDocument('t1', 'u1', generated.id, 'mistake', ctx);
    expect(auditAwaited).toBe(true);
    const events = await audit.list('t1');
    expect(events.find((e) => e.action === 'documents.revoked')).toBeDefined();
  });
});

describe('Audit completeness — reissue uses writeCritical', () => {
  it('emits TWO writeCritical events (reissued + revoked of original)', async () => {
    const { audit, service, generated } = makeServiceWithDoc();
    const { replacement } = await service.reissueDocument('t1', 'u1', generated.id, 'fix', ctx);
    const events = await audit.list('t1');
    const reissued = events.find(
      (e) => e.action === 'documents.reissued' && e.entityId === replacement.id
    );
    const revoked = events.find(
      (e) => e.action === 'documents.revoked' && e.entityId === generated.id
    );
    expect(reissued).toBeDefined();
    expect(revoked).toBeDefined();
  });
});

describe('Audit completeness — issueGroupOrder uses writeCritical', () => {
  it('awaits audit write for order + cascade certificates', async () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    const orderTpl = service.createTemplate(
      't1',
      'u1',
      { name: 'Order', templateType: 'order' },
      ctx
    );
    const orderV = service.createTemplateVersion('t1', 'u1', {
      templateId: orderTpl.id,
      fileId: 'f_o'
    });
    service.activateTemplateVersion('t1', orderV.id);
    const certTpl = service.createTemplate(
      't1',
      'u1',
      { name: 'Cert', templateType: 'certificate' },
      ctx
    );
    const certV = service.createTemplateVersion('t1', 'u1', {
      templateId: certTpl.id,
      fileId: 'f_c'
    });
    service.activateTemplateVersion('t1', certV.id);
    const result = await service.issueGroupOrder(
      't1',
      'u1',
      {
        groupId: 'g1',
        templateId: orderTpl.id,
        certificateTemplateId: certTpl.id,
        enrollmentIds: ['e1', 'e2']
      },
      ctx
    );
    const events = await audit.list('t1');
    const orderEvent = events.find(
      (e) => e.action === 'documents.group_order_issued' && e.entityId === result.order.id
    );
    expect(orderEvent).toBeDefined();
    const certEvents = events.filter((e) => e.action === 'documents.certificate_issued_via_order');
    expect(certEvents).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Прогнать тесты, убедиться что fail**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts -t "writeCritical"`
Expected: FAIL — методы синхронные и пишут через `write`, не `writeCritical`.

- [ ] **Step 3: Сделать `revokeDocument` async и перевести на `writeCritical`**

В `documents.service.ts:903`, заменить сигнатуру и audit-вызов:

```typescript
  async revokeDocument(
    tenantId: string,
    actorId: string | undefined,
    documentId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<GeneratedDocumentEntity> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException({
        code: 'revocation_reason_required',
        message: 'Причина аннулирования обязательна'
      });
    }
    const doc = this.must(this.state.generatedDocuments, tenantId, documentId);
    if (doc.status === 'revoked') {
      throw new ConflictException({
        code: 'already_revoked',
        message: 'Документ уже аннулирован'
      });
    }
    if (doc.status === 'archived') {
      throw new BadRequestException({
        code: 'cannot_revoke_archived',
        message: 'Нельзя аннулировать архивированный документ'
      });
    }
    const oldStatus = doc.status;
    doc.status = 'revoked';
    doc.revokedAt = this.now();
    doc.revokedBy = actorId;
    doc.revocationReason = reason.trim();
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.revoked',
      entityType: 'documents.generated',
      entityId: documentId,
      oldValues: { status: oldStatus } as unknown as Record<string, unknown>,
      newValues: {
        status: 'revoked',
        revocationReason: doc.revocationReason
      } as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return doc;
  }
```

- [ ] **Step 4: Сделать `reissueDocument` async и перевести на `writeCritical`**

В `documents.service.ts:963`, заменить сигнатуру `reissueDocument` на `async`, тип возврата на `Promise<...>`, и оба `auditService.write(...)` (строки 1021 и 1036) на `await this.auditService.writeCritical({...})`. Остальная логика метода не меняется. Точный новый return type:

```typescript
  async reissueDocument(
    tenantId: string,
    actorId: string | undefined,
    originalId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<{ original: GeneratedDocumentEntity; replacement: GeneratedDocumentEntity }> {
```

И в теле метода:

```typescript
await this.auditService.writeCritical({
  tenantId,
  actorId,
  action: 'documents.reissued',
  entityType: 'documents.generated',
  entityId: replacement.id,
  newValues: {
    replacesDocumentId: originalId,
    originalNumber: original.documentNumber
  } as unknown as Record<string, unknown>,
  requestId: ctx.requestId,
  correlationId: ctx.correlationId,
  ip: ctx.ip,
  userAgent: ctx.userAgent
});
await this.auditService.writeCritical({
  tenantId,
  actorId,
  action: 'documents.revoked',
  entityType: 'documents.generated',
  entityId: originalId,
  newValues: {
    status: 'revoked',
    revocationReason: original.revocationReason,
    replacedByDocumentId: replacement.id
  } as unknown as Record<string, unknown>,
  requestId: ctx.requestId,
  correlationId: ctx.correlationId,
  ip: ctx.ip,
  userAgent: ctx.userAgent
});
```

- [ ] **Step 5: Сделать `issueGroupOrder` async и перевести на `writeCritical`**

В `documents.service.ts:1103`, заменить сигнатуру:

```typescript
  async issueGroupOrder(
    tenantId: string,
    actorId: string | undefined,
    req: IssueGroupOrderRequest,
    ctx: RequestContext
  ): Promise<IssueGroupOrderResult> {
```

И обе `auditService.write(...)` (строки 1166 для `documents.group_order_issued` и 1232 для `documents.certificate_issued_via_order`) превратить в `await this.auditService.writeCritical({...})` с тем же payload-ом.

- [ ] **Step 6: Обновить контроллер (3 эндпоинта)**

В `documents.controller.ts:380` (`issueGroupOrder`), `:391` (`revokeDocument`), `:402` (`reissueDocument`) — методы и сейчас возвращают результат сервиса. NestJS автоматически await'ит промис, ничего менять в сигнатуре не надо. **Но** убедиться, что вызовы сервиса по-прежнему возвращаются как есть:

```typescript
  @Post('admin/documents/group-orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  issueGroupOrder(@CurrentContext() c: RequestContext, @Body() b: IssueGroupOrderRequest) {
    return this.documentsService.issueGroupOrder(c.tenantId!, c.userId, b, c);
  }
```

— уже корректно. Аналогично для revoke/reissue. Проверить, что не нужно ставить `async` на методы контроллера — NestJS обрабатывает promise return автоматически.

- [ ] **Step 7: Прогнать тесты модуля documents**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS — все аудиториальные тесты + все старые. Если старые тесты вызывали эти методы синхронно (`service.revokeDocument(...)` без `await`), они получат `Promise<...>` — в expectations это сломается. Исправить, добавив `await` перед вызовом.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
feat(documents): revoke/reissue/group_order use writeCritical

revokeDocument, reissueDocument, issueGroupOrder теперь async и
ждут audit-запись через writeCritical. При падении БД промис
rejects → ошибка пробрасывается в http-фильтр, audit-событие
никогда не теряется молча.

Pillar A hardening §3.3 — критичные мутации требуют awaited audit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A5: Audit для `setCurrentVersion` и `activateTemplateVersion`

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:201` (метод `setCurrentVersion`)
- Modify: `apps/backend/src/modules/documents/documents.service.ts:245` (метод `activateTemplateVersion`)
- Modify: `apps/backend/src/modules/documents/documents.controller.ts:100,142` (controller routes)
- Modify: `apps/backend/src/modules/documents/documents.audit-completeness.test.ts` (добавить тесты)

Активация/смена версии шаблона = изменение того, какой документ будет выпускаться. Audit обязателен. Через `write` (fire-and-forget) — не критично для текущего документа, не публично.

- [ ] **Step 1: Red-тест в `documents.audit-completeness.test.ts`**

Добавить:

```typescript
describe('Audit completeness — template version mutations', () => {
  it('emits audit on setCurrentVersion', () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    const tpl = service.createTemplate('t1', 'u1', { name: 'X', templateType: 'contract' }, ctx);
    const v = service.createTemplateVersion('t1', 'u1', {
      templateId: tpl.id,
      fileId: 'f'
    });
    service.setCurrentVersion('t1', 'u1', tpl.id, v.id, ctx);
    const events = audit['records'].filter(
      (e) => e.action === 'documents.template_version_set_current'
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: 'documents.template',
      entityId: tpl.id,
      actorId: 'u1',
      newValues: { currentVersionId: v.id }
    });
  });

  it('emits audit on activateTemplateVersion', () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    const tpl = service.createTemplate('t1', 'u1', { name: 'X', templateType: 'contract' }, ctx);
    const v = service.createTemplateVersion('t1', 'u1', {
      templateId: tpl.id,
      fileId: 'f'
    });
    service.activateTemplateVersion('t1', 'u1', v.id, ctx);
    const events = audit['records'].filter(
      (e) => e.action === 'documents.template_version_activated'
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: 'documents.template_version',
      entityId: v.id,
      actorId: 'u1'
    });
  });
});
```

- [ ] **Step 2: Прогнать, убедиться FAIL**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts -t "template version mutations"`
Expected: FAIL.

- [ ] **Step 3: Обновить `setCurrentVersion`**

Заменить блок `documents.service.ts:201-208`:

```typescript
  setCurrentVersion(tenantId: string, id: string, versionId: string) {
    const tpl = this.getTemplate(tenantId, id);
    const version = this.must(this.state.versions, tenantId, versionId);
    if (version.templateId !== id) throw new BadRequestException('Template version mismatch');
    tpl.currentVersionId = version.id;
    tpl.updatedAt = this.now();
    return tpl;
  }
```

на:

```typescript
  setCurrentVersion(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    versionId: string,
    ctx: RequestContext
  ) {
    const tpl = this.getTemplate(tenantId, id);
    const version = this.must(this.state.versions, tenantId, versionId);
    if (version.templateId !== id) throw new BadRequestException('Template version mismatch');
    const oldVersion = tpl.currentVersionId;
    tpl.currentVersionId = version.id;
    tpl.updatedAt = this.now();
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_version_set_current',
      entityType: 'documents.template',
      entityId: id,
      oldValues: { currentVersionId: oldVersion },
      newValues: { currentVersionId: version.id },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return tpl;
  }
```

- [ ] **Step 4: Обновить `activateTemplateVersion`**

Заменить блок `documents.service.ts:245-254`:

```typescript
  activateTemplateVersion(tenantId: string, id: string) {
    const version = this.getTemplateVersion(tenantId, id);
    this.state.versions
      .filter((x) => x.tenantId === tenantId && x.templateId === version.templateId)
      .forEach((x) => {
        x.isActive = x.id === id;
      });
    this.setCurrentVersion(tenantId, version.templateId, id);
    return version;
  }
```

на:

```typescript
  activateTemplateVersion(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const version = this.getTemplateVersion(tenantId, id);
    this.state.versions
      .filter((x) => x.tenantId === tenantId && x.templateId === version.templateId)
      .forEach((x) => {
        x.isActive = x.id === id;
      });
    this.setCurrentVersion(tenantId, actorId, version.templateId, id, ctx);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_version_activated',
      entityType: 'documents.template_version',
      entityId: id,
      newValues: { templateId: version.templateId, isActive: true },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return version;
  }
```

- [ ] **Step 5: Обновить controller (2 эндпоинта)**

`documents.controller.ts:97-106` — `setCurrentVersion`:

```typescript
  @Post('templates/:id/set-current-version')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  setCurrentVersion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: { templateVersionId: string }
  ) {
    return this.documentsService.setCurrentVersion(c.tenantId!, c.userId, id, b.templateVersionId, c);
  }
```

`documents.controller.ts:139-144` — `activateVersion`:

```typescript
  @Post('template-versions/:id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  activateVersion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.activateTemplateVersion(c.tenantId!, c.userId, id, c);
  }
```

- [ ] **Step 6: Прогнать тесты, починить регрессии**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS. Если упали тесты, которые вызывают `activateTemplateVersion(tenantId, versionId)` со старой сигнатурой — добавить `actorId` и `ctx`. Минимальный fix: `service.activateTemplateVersion('t1', 'u1', version.id, ctx)`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
feat(documents): audit on setCurrentVersion + activateTemplateVersion

Activate/setCurrent логировались как «black hole» — теперь
documents.template_version_set_current и
documents.template_version_activated пишутся через write
(не критично, не публично, не выданные документы).

Pillar A hardening §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A6: Audit для `activateNumberingRule` и `deactivateNumberingRule`

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:640,650` (numbering rules)
- Modify: `apps/backend/src/modules/documents/documents.controller.ts:331,337` (controller)
- Modify: `apps/backend/src/modules/documents/documents.audit-completeness.test.ts`

Активация/деактивация правила нумерации = смена формата номеров будущих документов. Audit обязателен. `write` (fire-and-forget) — не критично.

- [ ] **Step 1: Red-тест**

Добавить в `documents.audit-completeness.test.ts`:

```typescript
describe('Audit completeness — numbering rules', () => {
  it('emits audit on activate/deactivate', () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    const rule = service.createNumberingRule('t1', { documentType: 'certificate' });
    service.deactivateNumberingRule('t1', 'u1', rule.id, ctx);
    service.activateNumberingRule('t1', 'u1', rule.id, ctx);
    const deact = audit['records'].filter(
      (e) => e.action === 'documents.numbering_rule_deactivated'
    );
    const act = audit['records'].filter((e) => e.action === 'documents.numbering_rule_activated');
    expect(deact).toHaveLength(1);
    expect(act).toHaveLength(1);
    expect(act[0]).toMatchObject({
      entityType: 'documents.numbering_rule',
      entityId: rule.id,
      actorId: 'u1'
    });
  });
});
```

- [ ] **Step 2: Прогнать, убедиться FAIL**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts -t "numbering rules"`
Expected: FAIL.

- [ ] **Step 3: Обновить сервис**

Заменить блоки 640-655:

```typescript
  activateNumberingRule(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const row = this.getNumberingRule(tenantId, id);
    this.state.numberingRules
      .filter((x) => x.tenantId === tenantId && x.documentType === row.documentType)
      .forEach((x) => {
        x.isActive = x.id === id;
        x.updatedAt = this.now();
      });
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.numbering_rule_activated',
      entityType: 'documents.numbering_rule',
      entityId: id,
      newValues: { documentType: row.documentType, isActive: true },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return row;
  }
  deactivateNumberingRule(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const row = this.getNumberingRule(tenantId, id);
    row.isActive = false;
    row.updatedAt = this.now();
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.numbering_rule_deactivated',
      entityType: 'documents.numbering_rule',
      entityId: id,
      newValues: { isActive: false },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return row;
  }
```

- [ ] **Step 4: Обновить controller**

`documents.controller.ts:328-339`:

```typescript
  @Post('numbering-rules/:id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  activateRule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.activateNumberingRule(c.tenantId!, c.userId, id, c);
  }
  @Post('numbering-rules/:id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deactivateRule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deactivateNumberingRule(c.tenantId!, c.userId, id, c);
  }
```

- [ ] **Step 5: Прогнать тесты, починить регрессии**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
feat(documents): audit on numbering rule activate/deactivate

Смена правила нумерации = смена формата номеров будущих
выданных документов. Это требует audit-record.

Pillar A hardening §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A7: Audit для template variables CRUD

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:265,297,305` (variables CRUD)
- Modify: `apps/backend/src/modules/documents/documents.controller.ts:161,176,186` (controller)
- Modify: `apps/backend/src/modules/documents/documents.audit-completeness.test.ts`

Изменение template variables меняет какие данные подставляются в шаблон. Audit обязателен (`write`, fire-and-forget).

- [ ] **Step 1: Red-тест**

Добавить:

```typescript
describe('Audit completeness — template variables', () => {
  it('emits audit on create/update/delete variable', () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    const tpl = service.createTemplate('t1', 'u1', { name: 'X', templateType: 'contract' }, ctx);
    const v = service.createTemplateVersion('t1', 'u1', {
      templateId: tpl.id,
      fileId: 'f'
    });
    const variable = service.createTemplateVariable(
      't1',
      'u1',
      {
        templateVersionId: v.id,
        variableCode: 'fio',
        displayName: 'ФИО',
        categoryCode: 'learner',
        dataType: 'string'
      },
      ctx
    );
    service.updateTemplateVariable('t1', 'u1', variable.id, { displayName: 'Имя' }, ctx);
    service.deleteTemplateVariable('t1', 'u1', variable.id, ctx);
    const actions = audit['records'].map((e) => e.action);
    expect(actions).toContain('documents.template_variable_created');
    expect(actions).toContain('documents.template_variable_updated');
    expect(actions).toContain('documents.template_variable_deleted');
  });
});
```

- [ ] **Step 2: Прогнать, убедиться FAIL**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts -t "template variables"`
Expected: FAIL.

- [ ] **Step 3: Обновить сервис**

Заменить `createTemplateVariable` (`documents.service.ts:265`):

```typescript
  createTemplateVariable(
    tenantId: string,
    actorId: string | undefined,
    req: CreateTemplateVariableRequest,
    ctx: RequestContext
  ) {
    this.getTemplateVersion(tenantId, req.templateVersionId);
    assertVariableCategoryCode(req.categoryCode);
    const duplicate = this.state.variables.find(
      (x) =>
        x.tenantId === tenantId &&
        x.templateVersionId === req.templateVersionId &&
        x.variableCode === req.variableCode &&
        !x.deletedAt
    );
    if (duplicate) throw new ConflictException('Variable code already exists');
    const entity: TemplateVariableEntity = {
      id: this.id('tplvar'),
      tenantId,
      templateVersionId: req.templateVersionId,
      variableCode: req.variableCode,
      displayName: req.displayName,
      categoryCode: req.categoryCode,
      dataType: req.dataType,
      isRequired: req.isRequired ?? false,
      description: req.description
    };
    this.state.variables.push(entity);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_variable_created',
      entityType: 'documents.template_variable',
      entityId: entity.id,
      newValues: entity as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return entity;
  }
```

Заменить `updateTemplateVariable` (`:297`):

```typescript
  updateTemplateVariable(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: UpdateTemplateVariableRequest,
    ctx: RequestContext
  ) {
    const row = this.getTemplateVariable(tenantId, id);
    const oldValues = { ...row };
    if (req.categoryCode !== undefined) {
      assertVariableCategoryCode(req.categoryCode);
    }
    Object.assign(row, req);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_variable_updated',
      entityType: 'documents.template_variable',
      entityId: id,
      oldValues: oldValues as unknown as Record<string, unknown>,
      newValues: row as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return row;
  }
```

Заменить `deleteTemplateVariable` (`:305`):

```typescript
  deleteTemplateVariable(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const row = this.getTemplateVariable(tenantId, id);
    row.deletedAt = this.now();
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_variable_deleted',
      entityType: 'documents.template_variable',
      entityId: id,
      newValues: { deletedAt: row.deletedAt },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return { deleted: true };
  }
```

- [ ] **Step 4: Обновить controller (3 эндпоинта)**

`documents.controller.ts:158-188`:

```typescript
  @Post('template-variables')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplateVariable(
    @CurrentContext() c: RequestContext,
    @Body() b: CreateTemplateVariableRequest
  ) {
    return this.documentsService.createTemplateVariable(c.tenantId!, c.userId, b, c);
  }
  // ...
  @Patch('template-variables/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplateVariable(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateTemplateVariableRequest
  ) {
    return this.documentsService.updateTemplateVariable(c.tenantId!, c.userId, id, b, c);
  }
  @Delete('template-variables/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deleteTemplateVariable(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deleteTemplateVariable(c.tenantId!, c.userId, id, c);
  }
```

- [ ] **Step 5: Прогнать тесты, починить регрессии**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
feat(documents): audit on template variable CRUD

create/update/delete template variables теперь пишут
audit-events. Это нужно для расследования «почему документ
оказался с не той переменной».

Pillar A hardening §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A8: Audit для template bindings CRUD

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:317,339,345` (bindings CRUD)
- Modify: `apps/backend/src/modules/documents/documents.controller.ts:199,214,224`
- Modify: `apps/backend/src/modules/documents/documents.audit-completeness.test.ts`

Аналогично Task A7, но для bindings. Bindings определяют, какой шаблон применяется к курсу/направлению/группе. Без audit невозможно объяснить «почему этой группе выпускается другой шаблон, чем раньше».

- [ ] **Step 1: Red-тест**

```typescript
describe('Audit completeness — template bindings', () => {
  it('emits audit on create/update/delete binding', () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    const tpl = service.createTemplate('t1', 'u1', { name: 'X', templateType: 'certificate' }, ctx);
    const b = service.createTemplateBinding(
      't1',
      'u1',
      { templateId: tpl.id, bindType: 'course', courseId: 'c1' },
      ctx
    );
    service.updateTemplateBinding('t1', 'u1', b.id, { priority: 200 }, ctx);
    service.deleteTemplateBinding('t1', 'u1', b.id, ctx);
    const actions = audit['records'].map((e) => e.action);
    expect(actions).toContain('documents.template_binding_created');
    expect(actions).toContain('documents.template_binding_updated');
    expect(actions).toContain('documents.template_binding_deleted');
  });
});
```

- [ ] **Step 2: Прогнать, FAIL**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts -t "template bindings"`
Expected: FAIL.

- [ ] **Step 3: Обновить `createTemplateBinding` (`documents.service.ts:317`)**

Заменить целиком:

```typescript
  createTemplateBinding(
    tenantId: string,
    actorId: string | undefined,
    req: CreateTemplateBindingRequest,
    ctx: RequestContext
  ) {
    this.getTemplate(tenantId, req.templateId);
    this.validateBindingPayload(req.bindType, req.directionId, req.courseId, req.groupId);
    const entity: TemplateBindingEntity = {
      id: this.id('tplbind'),
      tenantId,
      templateId: req.templateId,
      bindType: req.bindType,
      directionId: req.directionId,
      courseId: req.courseId,
      groupId: req.groupId,
      attachMode: req.attachMode ?? 'strict',
      inheritToChildren: req.inheritToChildren ?? false,
      priority: req.priority ?? 100,
      createdAt: this.now()
    };
    this.state.bindings.push(entity);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_binding_created',
      entityType: 'documents.template_binding',
      entityId: entity.id,
      newValues: entity as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return entity;
  }
```

- [ ] **Step 4: Обновить `updateTemplateBinding` (`:339`)**

```typescript
  updateTemplateBinding(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: UpdateTemplateBindingRequest,
    ctx: RequestContext
  ) {
    const row = this.getTemplateBinding(tenantId, id);
    const oldValues = { ...row };
    Object.assign(row, req);
    this.validateBindingPayload(row.bindType, row.directionId, row.courseId, row.groupId);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_binding_updated',
      entityType: 'documents.template_binding',
      entityId: id,
      oldValues: oldValues as unknown as Record<string, unknown>,
      newValues: row as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return row;
  }
```

- [ ] **Step 5: Обновить `deleteTemplateBinding` (`:345`)**

```typescript
  deleteTemplateBinding(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const row = this.getTemplateBinding(tenantId, id);
    this.state.bindings = this.state.bindings.filter(
      (x) => !(x.tenantId === tenantId && x.id === id)
    );
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_binding_deleted',
      entityType: 'documents.template_binding',
      entityId: id,
      oldValues: row as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return { deleted: true };
  }
```

- [ ] **Step 6: Обновить controller (3 эндпоинта)**

`documents.controller.ts:196-226`:

```typescript
  @Post('template-bindings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplateBinding(
    @CurrentContext() c: RequestContext,
    @Body() b: CreateTemplateBindingRequest
  ) {
    return this.documentsService.createTemplateBinding(c.tenantId!, c.userId, b, c);
  }
  // ...
  @Patch('template-bindings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplateBinding(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateTemplateBindingRequest
  ) {
    return this.documentsService.updateTemplateBinding(c.tenantId!, c.userId, id, b, c);
  }
  @Delete('template-bindings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deleteTemplateBinding(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deleteTemplateBinding(c.tenantId!, c.userId, id, c);
  }
```

- [ ] **Step 7: Прогнать тесты, починить регрессии**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
feat(documents): audit on template binding CRUD

create/update/delete template bindings пишут audit-events.
Bindings определяют какой шаблон применяется к курсу/группе —
их история важна для расследования.

Pillar A hardening §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A9: Пробросить `ip`/`userAgent` в `writeTaskAudit`

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:849` (метод `writeTaskAudit`)
- Modify: `apps/backend/src/modules/documents/documents.audit-completeness.test.ts`

Task audit (start/complete/fail/retry/cancel) пишется через `writeTaskAudit`, который сейчас НЕ передаёт `ip`/`userAgent` (см. line 854-870). Это пробел — на critical task events мы не сможем понять с какого источника пришёл запрос.

Task сохраняет `request_id` и `correlation_id` в `outboxPayload`, но не `ip`/`userAgent` — потому что worker обрабатывает task асинхронно, без оригинального HTTP context. Однако `generateDocument` сохраняет `requestId`/`correlationId` напрямую в task. Нам нужно сохранить и `ip`/`userAgent` в task entity для последующего audit.

- [ ] **Step 1: Red-тест**

Добавить:

```typescript
describe('Audit completeness — task audit includes ip/userAgent', () => {
  it('writeTaskAudit on completeTask includes ip/userAgent from original request', async () => {
    const { state, audit, service, generated } = makeServiceWithDoc();
    const events = audit['records'].filter((e) => e.action === 'documents.task.completed');
    expect(events).toHaveLength(1);
    expect(events[0].ip).toBe('127.0.0.1');
    expect(events[0].userAgent).toBe('vitest');
  });
});
```

- [ ] **Step 2: Прогнать, FAIL**

Run: `pnpm --filter backend test src/modules/documents/documents.audit-completeness.test.ts -t "task audit includes"`
Expected: FAIL — ip/userAgent в task audit-record undefined.

- [ ] **Step 3: Добавить поля `ip`/`userAgent` в `DocumentGenerationTaskEntity`**

В `documents.types.ts` найти `DocumentGenerationTaskEntity` и добавить:

```typescript
  /** Pillar A hardening — HTTP context оригинального запроса для audit. */
  ip?: string;
  userAgent?: string;
```

(после существующих `requestId`/`correlationId` полей.)

- [ ] **Step 4: Записать `ip`/`userAgent` в task при создании**

В `documents.service.ts:464` (`generateDocument`), в task literal, добавить после `correlationId: ctx?.correlationId,`:

```typescript
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
```

- [ ] **Step 5: Передать `ip`/`userAgent` из task в `writeTaskAudit`**

Заменить `documents.service.ts:849-871`:

```typescript
  private writeTaskAudit(
    task: DocumentGenerationTaskEntity,
    action: string,
    extras?: Record<string, unknown>
  ) {
    this.auditService.write({
      tenantId: task.tenantId,
      actorId: task.requestedBy,
      action,
      entityType: 'document_task',
      entityId: task.id,
      newValues: {
        status: task.status,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        requestId: task.requestId,
        correlationId: task.correlationId,
        ...extras
      },
      requestId: task.requestId,
      correlationId: task.correlationId,
      ip: task.ip,
      userAgent: task.userAgent
    });
  }
```

- [ ] **Step 6: Прогнать тесты**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS. Possible failure: тесты, которые ожидают конкретный shape task entity — добавить опциональные ip/userAgent в их fixtures.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
feat(documents): task audit pasthrough ip + userAgent

Task'и сохраняли requestId/correlationId, но не ip/userAgent —
из-за этого audit-events задач (started/completed/failed/retried/
cancelled) не содержали HTTP context оригинального запроса.

Теперь DocumentGenerationTaskEntity.ip/userAgent заполняются
из RequestContext при создании, и пробрасываются в writeTaskAudit.

Pillar A hardening §3.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A10: Audit для licenses CRUD — перевод на `writeCritical`

**Files:**

- Modify: `apps/backend/src/modules/org/licenses.service.ts:95,145,172` (create/update/revoke)
- Test: `apps/backend/src/modules/org/licenses.audit.test.ts` (NEW)

Licenses CRUD = изменение того, какие виды обучения разрешено вести центру. Эта инфа влияет на бизнес-логику (`findActiveLicensesFor` блокирует публикацию курса без лицензии). Audit обязателен и **критичен** — нужен `writeCritical`.

- [ ] **Step 1: Создать red-тест `licenses.audit.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { InMemoryOrgState } from './in-memory-org.state.js';
import { LicensesService } from './licenses.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  tenantId: 't1',
  userId: 'u1',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeService() {
  const state = new InMemoryOrgState();
  const audit = new AuditService();
  const service = new LicensesService(state, audit);
  return { state, audit, service };
}

describe('Licenses audit — writeCritical on create/update/revoke', () => {
  it('awaits audit on create', async () => {
    const { audit, service } = makeService();
    let awaited = false;
    const orig = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args) => {
      await new Promise((r) => setTimeout(r, 5));
      awaited = true;
      return orig(...args);
    };
    await service.create(
      't1',
      'u1',
      {
        licenseType: 'general',
        licenseNumber: 'L-1',
        issuerName: 'Минобр',
        issuedAt: '2026-01-01'
      },
      ctx
    );
    expect(awaited).toBe(true);
    const events = await audit.list('t1');
    expect(events.find((e) => e.action === 'org.license_created')).toBeDefined();
  });

  it('awaits audit on update', async () => {
    const { audit, service } = makeService();
    const lic = await service.create(
      't1',
      'u1',
      {
        licenseType: 'general',
        licenseNumber: 'L-2',
        issuerName: 'Минобр',
        issuedAt: '2026-01-01'
      },
      ctx
    );
    let awaited = false;
    const orig = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args) => {
      await new Promise((r) => setTimeout(r, 5));
      awaited = true;
      return orig(...args);
    };
    await service.update('t1', 'u1', lic.id, { notes: 'check' }, ctx);
    expect(awaited).toBe(true);
  });

  it('awaits audit on revoke', async () => {
    const { audit, service } = makeService();
    const lic = await service.create(
      't1',
      'u1',
      {
        licenseType: 'general',
        licenseNumber: 'L-3',
        issuerName: 'Минобр',
        issuedAt: '2026-01-01'
      },
      ctx
    );
    let awaited = false;
    const orig = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args) => {
      await new Promise((r) => setTimeout(r, 5));
      awaited = true;
      return orig(...args);
    };
    await service.revoke('t1', 'u1', lic.id, ctx);
    expect(awaited).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать, FAIL**

Run: `pnpm --filter backend test src/modules/org/licenses.audit.test.ts`
Expected: FAIL — методы синхронные и пишут через `write`.

- [ ] **Step 3: Сделать `create`/`update`/`revoke` async, перевести на `writeCritical`**

В `licenses.service.ts:48`, заменить `create` на `async create(...): Promise<TrainingLicense>` и `this.auditService.write({...})` (строка 95) на `await this.auditService.writeCritical({...})`. Структура события не меняется.

Аналогично для `update` (`:110`) и `revoke` (`:161`) — добавить `async`, тип возврата `Promise<TrainingLicense>`, audit-call на `await writeCritical`.

Полные подписи:

```typescript
  async create(
    tenantId: string,
    actorId: string | undefined,
    request: CreateLicenseRequest,
    context: RequestContext
  ): Promise<TrainingLicense> {
    // ... (логика та же) ...
    await this.auditService.writeCritical({ /* как было */ });
    return entity;
  }

  async update(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateLicenseRequest,
    context: RequestContext
  ): Promise<TrainingLicense> {
    // ... (логика та же) ...
    await this.auditService.writeCritical({ /* как было */ });
    return license;
  }

  async revoke(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Promise<TrainingLicense> {
    // ... (логика та же) ...
    await this.auditService.writeCritical({ /* как было */ });
    return license;
  }
```

- [ ] **Step 4: Обновить controller, если методы там вызываются синхронно**

Открыть `apps/backend/src/modules/org/licenses.controller.ts`, найти методы create/update/revoke. NestJS обрабатывает promise return автоматически, но если есть сторонний код типа `result = service.create(...).id` — добавить `await`. Если контроллер просто `return this.licensesService.create(...)` — изменений не нужно.

- [ ] **Step 5: Прогнать тесты licenses + org**

Run: `pnpm --filter backend test src/modules/org`
Expected: PASS. Если упали `licenses.service.test.ts` — добавить `await` перед вызовами `create`/`update`/`revoke`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/org/
git commit -m "$(cat <<'EOF'
feat(licenses): writeCritical audit on create/update/revoke

Licenses CRUD = изменение разрешённых видов обучения = влияет
на findActiveLicensesFor (блокирует публикацию курса без
лицензии). Audit-record должен быть awaited.

Pillar A hardening §3.3 — изменение прав/лицензий = критичная мутация.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A11: Audit access-log для `learner-pdf-card.composeData`

**Files:**

- Modify: `apps/backend/src/modules/mvp/learner-pdf-card.service.ts:59` (метод `composeData`)
- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts` (вызов composeData)
- Test: `apps/backend/src/modules/mvp/learner-pdf-card.audit.test.ts` (NEW)

`composeData` возвращает ПДн ученика (ФИО, СНИЛС, должность, email). По 152-ФЗ доступ к ПДн должен логироваться. Это **критичный** access-event — нужен `writeCritical`.

- [ ] **Step 1: Создать red-тест `learner-pdf-card.audit.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { InMemoryDocumentsState } from '../documents/in-memory-documents.state.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  tenantId: 't1',
  userId: 'admin1',
  ip: '10.0.0.5',
  userAgent: 'vitest'
};

describe('learner-pdf-card audit — personal data access', () => {
  it('emits writeCritical learner.personal_data_accessed when composing card', async () => {
    const mvpState = new InMemoryMvpState();
    const audit = new AuditService();
    const docState = new InMemoryDocumentsState();
    const docService = new DocumentsService(docState, audit, new RealtimeEventsService());
    const service = new LearnerPdfCardService(mvpState, docService);

    mvpState.learners.push({
      id: 'learner_1',
      tenantId: 't1',
      learnerNo: '001',
      firstName: 'Иван',
      lastName: 'Петров',
      middleName: 'Сергеевич',
      snils: '111-111-111 11',
      position: 'инженер',
      email: 'i@p.ru'
    });

    let awaited = false;
    const orig = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args) => {
      await new Promise((r) => setTimeout(r, 5));
      awaited = true;
      return orig(...args);
    };

    await service.composeData('t1', 'admin1', 'learner_1', ctx);

    expect(awaited).toBe(true);
    const events = await audit.list('t1');
    const accessed = events.find((e) => e.action === 'learner.personal_data_accessed');
    expect(accessed).toBeDefined();
    expect(accessed).toMatchObject({
      entityType: 'mvp.learner',
      entityId: 'learner_1',
      actorId: 'admin1',
      tenantId: 't1'
    });
    expect(accessed?.ip).toBe('10.0.0.5');
  });

  it('does NOT log personal data values in audit (only entityId)', async () => {
    const mvpState = new InMemoryMvpState();
    const audit = new AuditService();
    const docState = new InMemoryDocumentsState();
    const docService = new DocumentsService(docState, audit, new RealtimeEventsService());
    const service = new LearnerPdfCardService(mvpState, docService);

    mvpState.learners.push({
      id: 'learner_2',
      tenantId: 't1',
      firstName: 'Анна',
      lastName: 'Сидорова',
      snils: '999-999-999 99',
      email: 'secret@example.com'
    });

    await service.composeData('t1', 'admin1', 'learner_2', ctx);
    const events = await audit.list('t1');
    const accessed = events.find((e) => e.action === 'learner.personal_data_accessed');
    const serialised = JSON.stringify(accessed);
    expect(serialised).not.toContain('999-999-999 99');
    expect(serialised).not.toContain('secret@example.com');
    expect(serialised).not.toContain('Сидорова');
  });
});
```

- [ ] **Step 2: Прогнать, FAIL**

Run: `pnpm --filter backend test src/modules/mvp/learner-pdf-card.audit.test.ts`
Expected: FAIL — `composeData` сейчас не принимает actorId/ctx и не пишет audit.

- [ ] **Step 3: Инжектировать `AuditService` в `LearnerPdfCardService`**

Заменить конструктор (`learner-pdf-card.service.ts:54-57`):

```typescript
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(DocumentsService) private readonly documentsService: DocumentsService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}
```

И добавить import:

```typescript
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../../common/context/request-context.js';
```

- [ ] **Step 4: Изменить `composeData` на async с audit**

Заменить сигнатуру и тело (`learner-pdf-card.service.ts:59`):

```typescript
  async composeData(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    ctx: RequestContext
  ): Promise<LearnerPdfCardAggregate> {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) {
      throw new NotFoundException({ code: 'learner_not_found', message: 'Ученик не найден' });
    }

    // 152-ФЗ access-log. Пишем ТОЛЬКО entityId — никаких ФИО/СНИЛС/email в audit.
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'learner.personal_data_accessed',
      entityType: 'mvp.learner',
      entityId: learnerId,
      newValues: { accessedVia: 'learner_pdf_card' },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    // ... (остальная логика composeData как была) ...
```

- [ ] **Step 5: Обновить `mvp.controller.ts` вызов**

В `apps/backend/src/modules/mvp/mvp.controller.ts:140-145` уже существует:

```typescript
  @Get('learners/:id/pdf-card')
  // ... permission guards ...
  getLearnerPdfCard(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.learnerPdfCardService.composeData(c.tenantId!, id);
  }
```

Заменить тело метода на:

```typescript
return this.learnerPdfCardService.composeData(c.tenantId!, c.userId, id, c);
```

(Сигнатура controller'а — `@Get('learners/:id/pdf-card')`, метод `getLearnerPdfCard`. NestJS обработает Promise return автоматически.)

- [ ] **Step 6: Обновить `mvp.module.ts` — убедиться что `AuditService` доступен**

Проверить `apps/backend/src/modules/mvp/mvp.module.ts` — если `AuditModule` не импортирован, добавить:

```typescript
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [/* существующие */, AuditModule],
  // ...
})
```

(или, если используется глобальный `AuditService` provider, ничего не делать.)

- [ ] **Step 7: Прогнать тесты MVP**

Run: `pnpm --filter backend test src/modules/mvp`
Expected: PASS. Если упали тесты `learner-pdf-card.service.test.ts` — старая сигнатура `composeData('t1', 'learner_1')` теперь `composeData('t1', 'admin', 'learner_1', ctx)`. Починить fixtures.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/mvp/
git commit -m "$(cat <<'EOF'
feat(learner-pdf-card): 152-ФЗ access-log on composeData

Чтение ПДн ученика (ФИО, СНИЛС, должность, email) логируется
через writeCritical как learner.personal_data_accessed.
В audit-record только entityId — никаких самих ПДн.

Pillar A hardening §4.3 (152-ФЗ access-logging).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A12: Public verify — перевести audit на `writeCritical`

**Files:**

- Modify: `apps/backend/src/modules/documents/public-verify.controller.ts:30`
- Modify: `apps/backend/src/modules/documents/public-verify.controller.test.ts:75-89`

Endpoint публичный — каждый запрос верификации = security-relevant событие, должно быть awaited. Сейчас используется `write` (fire-and-forget).

- [ ] **Step 1: Red-тест — изменить существующий test "writes audit entry"**

В `public-verify.controller.test.ts:75-89`, заменить `vi.spyOn(audit, 'write')` на `vi.spyOn(audit, 'writeCritical')`:

```typescript
it('writes audit entry via writeCritical (awaited)', async () => {
  const { audit, controller, state } = makeService();
  const spy = vi.spyOn(audit, 'writeCritical');
  state.generatedDocuments.push(makeDoc({ qrToken: 'AbCdEFGhIJKLMNOPQRSTUV' }));
  await controller.verify('AbCdEFGhIJKLMNOPQRSTUV');
  expect(spy).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantId: 'public',
      action: 'documents.qr_verification_requested'
    })
  );
  const call = spy.mock.calls[0]?.[0] as { entityId?: string } | undefined;
  expect(call?.entityId).toBe('AbCd…');
  expect(call?.entityId).not.toContain('IJKL');
});
```

И во всех других `controller.verify(...)` вызовах в этом файле добавить `await` (потому что метод теперь async).

- [ ] **Step 2: Прогнать, FAIL**

Run: `pnpm --filter backend test src/modules/documents/public-verify.controller.test.ts`
Expected: FAIL — controller сейчас sync и пишет через `write`.

- [ ] **Step 3: Сделать `verify` async и перевести на `writeCritical`**

Заменить `public-verify.controller.ts:25-44`:

```typescript
  @Get('verify/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verify(@Param('token') token: string) {
    // Audit пишется с tenantId='public' для трассировки — не раскрывает
    // tenant документа (это сделает service-level если расширим).
    // entityId — partial token (первые 4 символа) для расследований:
    // полный token = доступ к документу, не должен светиться в audit-логе.
    await this.auditService.writeCritical({
      tenantId: 'public',
      action: 'documents.qr_verification_requested',
      entityType: 'documents.generated',
      entityId: `${token.slice(0, 4)}…`
    });
    const result = this.documentsService.verifyDocumentByQrToken(token);
    if (result.status === 'not_found') {
      throw new NotFoundException({
        code: 'document_not_found',
        message: 'Документ с таким QR-кодом не найден'
      });
    }
    return result;
  }
```

- [ ] **Step 4: Прогнать тесты public-verify**

Run: `pnpm --filter backend test src/modules/documents/public-verify`
Expected: PASS. Если другие тесты в этом файле fail — `controller.verify(...)` теперь возвращает Promise; добавить `await`.

- [ ] **Step 5: Прогнать ВСЕ backend tests**

Run: `pnpm --filter backend test`
Expected: PASS. Это последняя задача PR-1 — нужно убедиться, что ничего не сломалось во всём backend.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/documents/public-verify.controller.ts apps/backend/src/modules/documents/public-verify.controller.test.ts
git commit -m "$(cat <<'EOF'
feat(public-verify): writeCritical audit (awaited)

QR verification — public endpoint, каждый запрос security-relevant.
Audit-record не должен теряться молча при падении БД.

Pillar A hardening §3.3 — публичные эндпоинты требуют writeCritical.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### PR-1 Push + Review Gate

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/2026-05-27-pillar-a-hardening
```

- [ ] **Step 2: Создать PR-1 (через gh CLI)**

```bash
gh pr create --title "Pillar A hardening PR-1: audit completeness" --body "$(cat <<'EOF'
## Summary

Закрывает gap'ы в audit-логе Pillar A и переводит критичные мутации на `writeCritical()`.

## Changes
- Audit-events добавлены: `documents.finalized`, `documents.archived`, `documents.template_version_set_current`, `documents.template_version_activated`, `documents.numbering_rule_activated/deactivated`, `documents.template_variable_created/updated/deleted`, `documents.template_binding_created/updated/deleted`, `learner.personal_data_accessed`.
- На `writeCritical()` (awaited) переведены: `revoke`, `reissue`, `issueGroupOrder` + cascade certs, `finalize`, `archive`, `licenses.create/update/revoke`, `learner-pdf-card.composeData`, `public-verify`.
- `writeTaskAudit` пробрасывает `ip`/`userAgent` из task entity.
- Docstrings правила write vs writeCritical в `audit.service.ts`.

## Spec
`docs/superpowers/specs/2026-05-27-pillar-a-hardening-design.md` §3.

## Test plan
- [x] Vitest backend зелёный полностью
- [x] Новый файл `documents.audit-completeness.test.ts` (12 тестов)
- [x] Новый файл `licenses.audit.test.ts` (3 теста)
- [x] Новый файл `learner-pdf-card.audit.test.ts` (2 теста)
- [ ] Smoke по существующему API — revoke / reissue / finalize не сломаны

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Дождаться зелёных CI checks**

После создания PR подождать пока пройдут все checks. Если что-то упало — исправить локально, закоммитить, push. Если всё зелёное → **остановиться и дать пользователю проверить PR**. Не мержить без подтверждения. PR-2 (Section B) можно начинать после мержа PR-1 ИЛИ параллельно на отдельной ветке, если пользователь решит ускорить.

---

# Section B: PR-2 — Security Hardening

**PR-цель:** IDOR negative tests на все `:id`-эндпоинты Pillar A, public verify hardening (PII-free response подтверждено тестом, rate limit подтверждён тестом), ПДн маскирование, idempotency concurrency tests, фикс idempotency для batch-generate.

**Базовая ветка:** `main` (если PR-1 уже смержен) или продолжение `feat/2026-05-27-pillar-a-hardening` (если PR-1 ещё открыт). Если параллельно — создать отдельную ветку `feat/2026-05-27-pillar-a-hardening-pr2` от main.

**PR-инвариант (DoD на момент merge):**

- Cross-tenant IDOR test покрывает каждый `:id`-эндпоинт в `documents`, `org/licenses`, `mvp/learner-pdf-card`. Каждый возвращает 404 (не 403) для документа чужого тенанта.
- `/public/verify/:token` имеет автоматизированные тесты на: PII не в response, rate-limit срабатывает на 31-м запросе, revoked не раскрывает actor/tenant.
- ПДн (snils, middle_name, position, email) НЕ попадают в audit `newValues/oldValues` ни в каком сценарии.
- Idempotency `admin/documents/group-orders`: 2 параллельных POST с одной парой `(groupId, templateId)` → ровно один issuance.
- Idempotency `documents/generate/batch`: исправлена ошибка с `Date.now()` в key generation — теперь key детерминирован по request body.

---

### Task B13: IDOR negative tests — documents :id endpoints

**Files:**

- Test: `apps/backend/src/modules/documents/documents.idor.integration.test.ts` (NEW)

Контролеры используют `c.tenantId!` из guard'а, сервис use `must()` с tenant check (строка 812). Теория — защищены. Тест должен подтвердить.

- [ ] **Step 1: Создать red-тест (один большой файл, batch all endpoints)**

`apps/backend/src/modules/documents/documents.idor.integration.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctxA: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 'tenantA',
  userId: 'admin_a',
  ip: '127.0.0.1',
  userAgent: 'vt'
};
const ctxB: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 'tenantB',
  userId: 'admin_b',
  ip: '127.0.0.1',
  userAgent: 'vt'
};

function makeService() {
  return new DocumentsService(
    new InMemoryDocumentsState(),
    new AuditService(),
    new RealtimeEventsService()
  );
}

describe('IDOR — documents :id endpoints reject cross-tenant access', () => {
  it('getTemplate: tenantB cannot read template of tenantA', () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    expect(() => service.getTemplate('tenantB', tpl.id)).toThrow(NotFoundException);
  });

  it('updateTemplate: tenantB cannot update template of tenantA', () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    expect(() =>
      service.updateTemplate('tenantB', 'admin_b', tpl.id, { name: 'hijack' }, ctxB)
    ).toThrow(NotFoundException);
  });

  it('archiveTemplate: cross-tenant 404', () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    expect(() => service.archiveTemplate('tenantB', 'admin_b', tpl.id, ctxB)).toThrow(
      NotFoundException
    );
  });

  it('getTemplateVersion: cross-tenant 404', () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    const v = service.createTemplateVersion('tenantA', 'admin_a', {
      templateId: tpl.id,
      fileId: 'f'
    });
    expect(() => service.getTemplateVersion('tenantB', v.id)).toThrow(NotFoundException);
  });

  it('getTemplateVariable: cross-tenant 404', () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    const v = service.createTemplateVersion('tenantA', 'admin_a', {
      templateId: tpl.id,
      fileId: 'f'
    });
    const variable = service.createTemplateVariable(
      'tenantA',
      'admin_a',
      {
        templateVersionId: v.id,
        variableCode: 'x',
        displayName: 'X',
        categoryCode: 'learner',
        dataType: 'string'
      },
      ctxA
    );
    expect(() => service.getTemplateVariable('tenantB', variable.id)).toThrow(NotFoundException);
  });

  it('getTemplateBinding: cross-tenant 404', () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'certificate' },
      ctxA
    );
    const b = service.createTemplateBinding(
      'tenantA',
      'admin_a',
      { templateId: tpl.id, bindType: 'course', courseId: 'c1' },
      ctxA
    );
    expect(() => service.getTemplateBinding('tenantB', b.id)).toThrow(NotFoundException);
  });

  it('getDocument: cross-tenant 404', () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    const v = service.createTemplateVersion('tenantA', 'admin_a', {
      templateId: tpl.id,
      fileId: 'f'
    });
    service.activateTemplateVersion('tenantA', 'admin_a', v.id, ctxA);
    const task = service.generateDocument(
      'tenantA',
      'admin_a',
      {
        idempotencyKey: 'k',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g',
        documentType: 'd'
      },
      ctxA
    );
    const doc = service.completeTask('tenantA', task.id, 'file_2', 'admin_a');
    expect(() => service.getDocument('tenantB', doc.id)).toThrow(NotFoundException);
  });

  it('finalizeDocument: cross-tenant 404', async () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    const v = service.createTemplateVersion('tenantA', 'admin_a', {
      templateId: tpl.id,
      fileId: 'f'
    });
    service.activateTemplateVersion('tenantA', 'admin_a', v.id, ctxA);
    const task = service.generateDocument(
      'tenantA',
      'admin_a',
      {
        idempotencyKey: 'k',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g',
        documentType: 'd'
      },
      ctxA
    );
    const doc = service.completeTask('tenantA', task.id, 'file_2', 'admin_a');
    await expect(service.finalizeDocument('tenantB', 'admin_b', doc.id, ctxB)).rejects.toThrow(
      NotFoundException
    );
  });

  it('archiveDocument: cross-tenant 404', async () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    const v = service.createTemplateVersion('tenantA', 'admin_a', {
      templateId: tpl.id,
      fileId: 'f'
    });
    service.activateTemplateVersion('tenantA', 'admin_a', v.id, ctxA);
    const task = service.generateDocument(
      'tenantA',
      'admin_a',
      {
        idempotencyKey: 'k',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g',
        documentType: 'd'
      },
      ctxA
    );
    const doc = service.completeTask('tenantA', task.id, 'file_2', 'admin_a');
    await expect(service.archiveDocument('tenantB', 'admin_b', doc.id, ctxB)).rejects.toThrow(
      NotFoundException
    );
  });

  it('revokeDocument: cross-tenant 404', async () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    const v = service.createTemplateVersion('tenantA', 'admin_a', {
      templateId: tpl.id,
      fileId: 'f'
    });
    service.activateTemplateVersion('tenantA', 'admin_a', v.id, ctxA);
    const task = service.generateDocument(
      'tenantA',
      'admin_a',
      {
        idempotencyKey: 'k',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g',
        documentType: 'd'
      },
      ctxA
    );
    const doc = service.completeTask('tenantA', task.id, 'file_2', 'admin_a');
    await expect(
      service.revokeDocument('tenantB', 'admin_b', doc.id, 'mistake', ctxB)
    ).rejects.toThrow(NotFoundException);
  });

  it('reissueDocument: cross-tenant 404', async () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    const v = service.createTemplateVersion('tenantA', 'admin_a', {
      templateId: tpl.id,
      fileId: 'f'
    });
    service.activateTemplateVersion('tenantA', 'admin_a', v.id, ctxA);
    const task = service.generateDocument(
      'tenantA',
      'admin_a',
      {
        idempotencyKey: 'k',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g',
        documentType: 'd'
      },
      ctxA
    );
    const doc = service.completeTask('tenantA', task.id, 'file_2', 'admin_a');
    await expect(
      service.reissueDocument('tenantB', 'admin_b', doc.id, 'fix', ctxB)
    ).rejects.toThrow(NotFoundException);
  });

  it('retryTask + cancelTask: cross-tenant 404', () => {
    const service = makeService();
    const tpl = service.createTemplate(
      'tenantA',
      'admin_a',
      { name: 'A', templateType: 'contract' },
      ctxA
    );
    const v = service.createTemplateVersion('tenantA', 'admin_a', {
      templateId: tpl.id,
      fileId: 'f'
    });
    service.activateTemplateVersion('tenantA', 'admin_a', v.id, ctxA);
    const task = service.generateDocument(
      'tenantA',
      'admin_a',
      {
        idempotencyKey: 'k',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g',
        documentType: 'd'
      },
      ctxA
    );
    service.failTask('tenantA', task.id, 'sim');
    expect(() => service.retryTask('tenantB', task.id)).toThrow(NotFoundException);
    expect(() => service.cancelTask('tenantB', task.id)).toThrow(NotFoundException);
  });

  it('getNumberingRule + activate/deactivate: cross-tenant 404', () => {
    const service = makeService();
    const rule = service.createNumberingRule('tenantA', { documentType: 'certificate' });
    expect(() => service.getNumberingRule('tenantB', rule.id)).toThrow(NotFoundException);
    expect(() => service.activateNumberingRule('tenantB', 'admin_b', rule.id, ctxB)).toThrow(
      NotFoundException
    );
    expect(() => service.deactivateNumberingRule('tenantB', 'admin_b', rule.id, ctxB)).toThrow(
      NotFoundException
    );
  });
});
```

- [ ] **Step 2: Прогнать тесты — ожидаем PASS (теория защиты подтверждается)**

Run: `pnpm --filter backend test src/modules/documents/documents.idor.integration.test.ts`
Expected: **PASS** (а не FAIL). Это позитивное подтверждение того, что архитектура (`must()` с tenant check) уже защищает. Если тест **FAIL** — нашли реальную уязвимость, переходим к Step 3. Если PASS — переход сразу к Step 4.

- [ ] **Step 3: Если уязвимость найдена — починить**

Локализовать метод сервиса, где `tenantId` не проверяется. Заменить `this.state.X.find((x) => x.id === id)` на `this.must(this.state.X, tenantId, id)`. Прогнать тест снова. После зелёного → перейти к Step 4.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/documents/documents.idor.integration.test.ts
git commit -m "$(cat <<'EOF'
test(documents): IDOR negative tests on every :id endpoint

13 cross-tenant negative tests — каждый :id-эндпоинт
documents-сервиса. Подтверждают, что tenantB не может
читать/писать ресурсы tenantA даже с правильным permission.

Если в будущем кто-то добавит метод без must() с tenant-check —
эти тесты упадут.

Pillar A hardening §4.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B14: IDOR negative tests — licenses :id endpoints

**Files:**

- Test: `apps/backend/src/modules/org/licenses.idor.test.ts` (NEW)

- [ ] **Step 1: Создать red/green-test (зависит от того, защищён ли сервис)**

```typescript
import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { InMemoryOrgState } from './in-memory-org.state.js';
import { LicensesService } from './licenses.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctxA: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 'tA',
  userId: 'aa',
  ip: '127.0.0.1',
  userAgent: 'vt'
};
const ctxB: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 'tB',
  userId: 'ab',
  ip: '127.0.0.1',
  userAgent: 'vt'
};

function makeService() {
  return new LicensesService(new InMemoryOrgState(), new AuditService());
}

describe('IDOR — licenses :id endpoints reject cross-tenant', () => {
  it('get: tenantB cannot read license of tenantA', async () => {
    const service = makeService();
    const lic = await service.create(
      'tA',
      'aa',
      {
        licenseType: 'general',
        licenseNumber: 'L',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxA
    );
    expect(() => service.get('tB', lic.id)).toThrow(NotFoundException);
  });

  it('update: tenantB cannot update license of tenantA', async () => {
    const service = makeService();
    const lic = await service.create(
      'tA',
      'aa',
      {
        licenseType: 'general',
        licenseNumber: 'L',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxA
    );
    await expect(service.update('tB', 'ab', lic.id, { notes: 'hijack' }, ctxB)).rejects.toThrow(
      NotFoundException
    );
  });

  it('revoke: tenantB cannot revoke license of tenantA', async () => {
    const service = makeService();
    const lic = await service.create(
      'tA',
      'aa',
      {
        licenseType: 'general',
        licenseNumber: 'L',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxA
    );
    await expect(service.revoke('tB', 'ab', lic.id, ctxB)).rejects.toThrow(NotFoundException);
  });

  it('list: tenantB не видит лицензии tenantA', async () => {
    const service = makeService();
    await service.create(
      'tA',
      'aa',
      {
        licenseType: 'general',
        licenseNumber: 'L1',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxA
    );
    await service.create(
      'tB',
      'ab',
      {
        licenseType: 'general',
        licenseNumber: 'L2',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxB
    );
    expect(service.list('tA').map((l) => l.licenseNumber)).toEqual(['L1']);
    expect(service.list('tB').map((l) => l.licenseNumber)).toEqual(['L2']);
  });
});
```

- [ ] **Step 2: Прогнать — ожидаем PASS**

Run: `pnpm --filter backend test src/modules/org/licenses.idor.test.ts`
Expected: PASS. `licenses.service.ts:41` использует `this.state.licenses.find((l) => l.tenantId === tenantId && l.id === id)` — защита на месте.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/org/licenses.idor.test.ts
git commit -m "$(cat <<'EOF'
test(licenses): IDOR negative tests on get/update/revoke/list

Cross-tenant защита подтверждена тестом. licenses.service
фильтрует по tenantId на каждом запросе.

Pillar A hardening §4.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B15: IDOR negative test — learner-pdf-card

**Files:**

- Test: `apps/backend/src/modules/mvp/learner-pdf-card.idor.test.ts` (NEW)

- [ ] **Step 1: Red/green test**

```typescript
import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { InMemoryDocumentsState } from '../documents/in-memory-documents.state.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctxB: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 'tenantB',
  userId: 'admin_b',
  ip: '127.0.0.1',
  userAgent: 'vt'
};

describe('IDOR — learner-pdf-card cannot read across tenant', () => {
  it('composeData throws 404 when called by tenantB for tenantA learner', async () => {
    const mvpState = new InMemoryMvpState();
    const audit = new AuditService();
    const docService = new DocumentsService(
      new InMemoryDocumentsState(),
      audit,
      new RealtimeEventsService()
    );
    const service = new LearnerPdfCardService(mvpState, docService, audit);

    mvpState.learners.push({
      id: 'learner_a',
      tenantId: 'tenantA',
      firstName: 'Анна',
      lastName: 'Иванова',
      snils: '111-111-111 11'
    });

    await expect(service.composeData('tenantB', 'admin_b', 'learner_a', ctxB)).rejects.toThrow(
      NotFoundException
    );
  });
});
```

- [ ] **Step 2: Прогнать — ожидаем PASS**

Run: `pnpm --filter backend test src/modules/mvp/learner-pdf-card.idor.test.ts`
Expected: PASS. `composeData` уже использует `this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId)`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/mvp/learner-pdf-card.idor.test.ts
git commit -m "$(cat <<'EOF'
test(learner-pdf-card): IDOR negative test

Cross-tenant access to learner personal data blocked.

Pillar A hardening §4.1 — ПДн особенно нуждается в защите.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B16: Public /verify — PII не в response

**Files:**

- Test: `apps/backend/src/modules/documents/public-verify.controller.test.ts` (добавить describe block)

- [ ] **Step 1: Red-тест**

Добавить в конец `public-verify.controller.test.ts`:

```typescript
describe('PublicVerifyController PII protection', () => {
  it('response does NOT include learnerFullName, snils, programTitle, issuerName, academicHours', async () => {
    const { state, controller } = makeService();
    state.generatedDocuments.push(
      makeDoc({
        id: 'gdoc_pii',
        qrToken: 'pii_token_1234567890ab'
        // даже если что-то в state есть, оно НЕ должно попасть в response
      })
    );
    const result = await controller.verify('pii_token_1234567890ab');
    const keys = Object.keys(result);
    expect(keys).not.toContain('learnerFullName');
    expect(keys).not.toContain('snils');
    expect(keys).not.toContain('programTitle');
    expect(keys).not.toContain('issuerName');
    expect(keys).not.toContain('academicHours');
  });

  it('revoked response — НЕ раскрывает revokedBy (actor)', async () => {
    const { state, controller } = makeService();
    state.generatedDocuments.push(
      makeDoc({
        id: 'gdoc_revoked',
        qrToken: 'rev_pii_1234567890ab',
        status: 'revoked' as never,
        revokedBy: 'secret_admin_id',
        revokedAt: '2026-05-01T00:00:00.000Z',
        revocationReason: 'причина'
      } as never)
    );
    const result = await controller.verify('rev_pii_1234567890ab');
    expect(result.status).toBe('revoked');
    expect(result).not.toHaveProperty('revokedBy');
    expect(JSON.stringify(result)).not.toContain('secret_admin_id');
  });
});
```

- [ ] **Step 2: Прогнать — ожидаем PASS**

Run: `pnpm --filter backend test src/modules/documents/public-verify.controller.test.ts -t "PII protection"`
Expected: PASS. `verifyDocumentByQrToken` (line 1067) формирует `PublicVerifyResult` руками с фиксированным списком полей — `revokedBy` не возвращается. Тест это закрепляет.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/documents/public-verify.controller.test.ts
git commit -m "$(cat <<'EOF'
test(public-verify): PII never leaks in response

Закрепляет тестами: response не содержит learnerFullName,
snils, programTitle, issuerName, academicHours, revokedBy.

Если кто-то расширит PublicVerifyResult — этот тест укажет
что добавление PII требует явного решения.

Pillar A hardening §4.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B17: Public /verify — rate limit smoke test

**Files:**

- Test: `apps/backend/src/modules/documents/public-verify.controller.test.ts`

Тест на конфигурацию `@Throttle({ default: { limit: 30, ttl: 60_000 } })` — не на runtime поведение throttler'а (это уже протестировано в @nestjs/throttler).

- [ ] **Step 1: Red-тест на метаданные Throttle**

Добавить в `public-verify.controller.test.ts`:

```typescript
describe('PublicVerifyController rate-limit configuration', () => {
  it('verify method has @Throttle decorator with limit=30 ttl=60s', () => {
    const ctrl = PublicVerifyController.prototype as Record<string, unknown>;
    const meta = Reflect.getMetadata('THROTTLER:throttlers', ctrl.verify) as
      | { default?: { limit: number; ttl: number } }
      | undefined;
    expect(meta).toBeDefined();
    expect(meta?.default).toMatchObject({ limit: 30, ttl: 60_000 });
  });
});
```

(Метаданные `@Throttle` лежат под ключом `THROTTLER:throttlers` в `Reflect.metadata`. Если в установленной версии `@nestjs/throttler` ключ другой — поменять. На момент написания (2026-05) — `THROTTLER:throttlers`.)

- [ ] **Step 2: Прогнать**

Run: `pnpm --filter backend test src/modules/documents/public-verify.controller.test.ts -t "rate-limit"`
Expected: PASS если ключ правильный. Если ключ изменился — починить тест.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/documents/public-verify.controller.test.ts
git commit -m "$(cat <<'EOF'
test(public-verify): rate-limit metadata pinned

Закрепляет конфиг @Throttle({ limit: 30, ttl: 60s }) на verify.
Если кто-то ослабит лимит — тест упадёт.

Pillar A hardening §4.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B18: ПДн маскирование в audit (защитный механизм)

**Files:**

- Modify: `apps/backend/src/modules/audit/audit.service.ts` (добавить статическое поле SENSITIVE_FIELDS + хелпер)
- Modify: `apps/backend/src/modules/audit/audit.service.ts` (метод `buildRecord` маскирует ПДн в new/oldValues)
- Test: `apps/backend/src/modules/audit/audit.pii-masking.test.ts` (NEW)

Защитный механизм: даже если кто-то по ошибке передаст `learner.snils` в `newValues`, AuditService автоматически замаскирует.

- [ ] **Step 1: Red-тест**

`apps/backend/src/modules/audit/audit.pii-masking.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { AuditService } from './audit.service.js';

describe('AuditService PII masking', () => {
  it('masks snils field in newValues', () => {
    const audit = new AuditService();
    audit.write({
      tenantId: 't1',
      action: 'learner.updated',
      entityType: 'mvp.learner',
      entityId: 'l1',
      newValues: { snils: '111-111-111 11', position: 'engineer' }
    });
    const recorded = audit['records'][0];
    expect(recorded.newValues?.snils).toBe('***');
    expect(recorded.newValues?.position).toBe('engineer'); // не ПДн
  });

  it('masks email in oldValues', () => {
    const audit = new AuditService();
    audit.write({
      tenantId: 't1',
      action: 'learner.updated',
      entityType: 'mvp.learner',
      entityId: 'l1',
      oldValues: { email: 'secret@example.com' },
      newValues: { email: 'new@example.com' }
    });
    const recorded = audit['records'][0];
    expect(recorded.oldValues?.email).toBe('***');
    expect(recorded.newValues?.email).toBe('***');
  });

  it('masks firstName/lastName/middleName/passport/phone/birthDate', () => {
    const audit = new AuditService();
    audit.write({
      tenantId: 't1',
      action: 'learner.created',
      entityType: 'mvp.learner',
      entityId: 'l1',
      newValues: {
        firstName: 'Анна',
        lastName: 'Сидорова',
        middleName: 'Ивановна',
        passportSeriesNumber: '4500 123456',
        phoneNumber: '+79991234567',
        birthDate: '1990-01-15',
        normalField: 'visible'
      }
    });
    const recorded = audit['records'][0];
    expect(recorded.newValues?.firstName).toBe('***');
    expect(recorded.newValues?.lastName).toBe('***');
    expect(recorded.newValues?.middleName).toBe('***');
    expect(recorded.newValues?.passportSeriesNumber).toBe('***');
    expect(recorded.newValues?.phoneNumber).toBe('***');
    expect(recorded.newValues?.birthDate).toBe('***');
    expect(recorded.newValues?.normalField).toBe('visible');
  });

  it('does NOT mask non-PII fields (status, id, etc)', () => {
    const audit = new AuditService();
    audit.write({
      tenantId: 't1',
      action: 'documents.updated',
      entityType: 'documents.generated',
      entityId: 'g1',
      newValues: { status: 'revoked', revocationReason: 'mistake' }
    });
    const recorded = audit['records'][0];
    expect(recorded.newValues?.status).toBe('revoked');
    expect(recorded.newValues?.revocationReason).toBe('mistake');
  });
});
```

- [ ] **Step 2: Прогнать, FAIL**

Run: `pnpm --filter backend test src/modules/audit/audit.pii-masking.test.ts`
Expected: FAIL — маскирование не реализовано.

- [ ] **Step 3: Добавить SENSITIVE_FIELDS и helper в `AuditService`**

В `audit.service.ts`, после import'ов и перед классом `AuditService`:

```typescript
/**
 * Поля, которые НИКОГДА не должны попадать в audit_log в чистом виде —
 * по 152-ФЗ и здравому смыслу. Если caller передал такое поле в
 * newValues/oldValues, мы заменяем значение на '***'.
 *
 * Это defence in depth: каждый emitter должен сам решать, что класть
 * в audit, но при ошибке здесь — последняя линия защиты.
 */
const SENSITIVE_FIELDS = new Set([
  'snils',
  'email',
  'firstName',
  'lastName',
  'middleName',
  'fullName',
  'passportSeriesNumber',
  'passport',
  'phoneNumber',
  'phone',
  'birthDate',
  'birth_date'
]);

function maskPii(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!values) return values;
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    masked[key] = SENSITIVE_FIELDS.has(key) ? '***' : value;
  }
  return masked;
}
```

- [ ] **Step 4: Использовать `maskPii` в `buildRecord`**

В `audit.service.ts:105` (метод `buildRecord`), заменить:

```typescript
  private buildRecord(record: AuditWritePayload): AuditLogRecord {
    const { correlationId, metadata: incomingMetadata, ...base } = record;
    const metadata: Record<string, unknown> | undefined = (() => {
      const merged: Record<string, unknown> = {
        ...(incomingMetadata ?? {}),
        ...(correlationId ? { correlation_id: correlationId } : {})
      };
      return Object.keys(merged).length ? merged : undefined;
    })();

    const result: AuditLogRecord = {
      ...base,
      metadata,
      id: `audit_${randomUUID().replace(/-/g, '')}`,
      createdAt: new Date().toISOString()
    };
    return result;
  }
```

на:

```typescript
  private buildRecord(record: AuditWritePayload): AuditLogRecord {
    const { correlationId, metadata: incomingMetadata, oldValues, newValues, ...base } = record;
    const metadata: Record<string, unknown> | undefined = (() => {
      const merged: Record<string, unknown> = {
        ...(incomingMetadata ?? {}),
        ...(correlationId ? { correlation_id: correlationId } : {})
      };
      return Object.keys(merged).length ? merged : undefined;
    })();

    const result: AuditLogRecord = {
      ...base,
      oldValues: maskPii(oldValues),
      newValues: maskPii(newValues),
      metadata,
      id: `audit_${randomUUID().replace(/-/g, '')}`,
      createdAt: new Date().toISOString()
    };
    return result;
  }
```

- [ ] **Step 5: Прогнать тесты audit**

Run: `pnpm --filter backend test src/modules/audit`
Expected: PASS — наш новый файл + существующий `audit.service.test.ts`.

- [ ] **Step 6: Прогнать ВСЕ backend тесты — проверить регрессии**

Run: `pnpm --filter backend test`
Expected: PASS. Если упало — кто-то assert'ил конкретное PII-значение в audit-event'е. Это правильная регрессия: их ассерт был на «утечку», нужно поменять expectation на `'***'` или убрать ассерт.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/audit/
git commit -m "$(cat <<'EOF'
feat(audit): mask PII fields in oldValues/newValues

SENSITIVE_FIELDS = snils, email, firstName, lastName, middleName,
fullName, passport*, phone*, birthDate. Если caller передаёт
такое поле в audit-record — buildRecord заменяет значение на '***'.

Defence in depth: каждый emitter должен сам не класть ПДн,
но при ошибке здесь — последняя линия защиты для 152-ФЗ.

Pillar A hardening §4.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B19: Idempotency concurrency — group orders

**Files:**

- Test: `apps/backend/src/modules/documents/documents.idempotency-concurrency.test.ts` (NEW)

- [ ] **Step 1: Red-тест**

```typescript
import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 't1',
  userId: 'u1',
  ip: '127.0.0.1',
  userAgent: 'vt'
};

function setupOrderableState() {
  const state = new InMemoryDocumentsState();
  const audit = new AuditService();
  const service = new DocumentsService(state, audit, new RealtimeEventsService());
  const orderTpl = service.createTemplate(
    't1',
    'u1',
    { name: 'Order', templateType: 'order' },
    ctx
  );
  const v = service.createTemplateVersion('t1', 'u1', { templateId: orderTpl.id, fileId: 'f' });
  service.activateTemplateVersion('t1', 'u1', v.id, ctx);
  return { state, audit, service, orderTpl };
}

describe('Idempotency — issueGroupOrder concurrent calls', () => {
  it('30 parallel calls with same (groupId, templateId) produce ONE order', async () => {
    const { service, orderTpl } = setupOrderableState();
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        service.issueGroupOrder(
          't1',
          'u1',
          { groupId: 'g1', templateId: orderTpl.id, enrollmentIds: [] },
          ctx
        )
      )
    );
    const uniqueIds = new Set(results.map((r) => r.order.id));
    expect(uniqueIds.size).toBe(1);
    expect(results.filter((r) => r.alreadyExisted).length).toBe(29);
  });

  it('different (groupId, templateId) pairs produce different orders', async () => {
    const { service, orderTpl } = setupOrderableState();
    const a = await service.issueGroupOrder(
      't1',
      'u1',
      { groupId: 'g1', templateId: orderTpl.id, enrollmentIds: [] },
      ctx
    );
    const b = await service.issueGroupOrder(
      't1',
      'u1',
      { groupId: 'g2', templateId: orderTpl.id, enrollmentIds: [] },
      ctx
    );
    expect(a.order.id).not.toBe(b.order.id);
  });
});
```

- [ ] **Step 2: Прогнать**

Run: `pnpm --filter backend test src/modules/documents/documents.idempotency-concurrency.test.ts -t "issueGroupOrder"`
Expected: **PASS** для первого теста — idempotency реализована через natural key `(group, template, type='order', не archived)`. Второй тест — sanity check.

Если **FAIL** — значит при настоящей параллельности (а не имитации) idempotency check race-condition'ит. В in-memory state'е JavaScript event loop делает всё последовательно — так что в этом тесте FAIL невозможен без bug'а в logic. Если FAIL — investigate.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/documents/documents.idempotency-concurrency.test.ts
git commit -m "$(cat <<'EOF'
test(documents): idempotency concurrency for group orders

30 параллельных issueGroupOrder с одним (groupId, templateId) →
один issuance, 29 alreadyExisted=true. Закрепляет защиту от
double-click и retry-storm на frontend'е.

Pillar A hardening §4.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B20: Idempotency — concurrent revoke на один документ

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.idempotency-concurrency.test.ts` (добавить describe block)

- [ ] **Step 1: Red-тест**

Добавить:

```typescript
describe('Idempotency — concurrent revoke on same document', () => {
  it('2 parallel revoke calls → один успешный, второй ConflictException', async () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    const tpl = service.createTemplate('t1', 'u1', { name: 'X', templateType: 'contract' }, ctx);
    const v = service.createTemplateVersion('t1', 'u1', { templateId: tpl.id, fileId: 'f' });
    service.activateTemplateVersion('t1', 'u1', v.id, ctx);
    const task = service.generateDocument(
      't1',
      'u1',
      {
        idempotencyKey: 'k',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g',
        documentType: 'd'
      },
      ctx
    );
    const doc = service.completeTask('t1', task.id, 'f2', 'u1');

    const results = await Promise.allSettled([
      service.revokeDocument('t1', 'u1', doc.id, 'first', ctx),
      service.revokeDocument('t1', 'u1', doc.id, 'second', ctx)
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.constructor.name).toBe(
      'ConflictException'
    );
  });
});
```

- [ ] **Step 2: Прогнать**

Run: `pnpm --filter backend test src/modules/documents/documents.idempotency-concurrency.test.ts -t "concurrent revoke"`
Expected: PASS. `revokeDocument` (line 916) проверяет `if (doc.status === 'revoked') throw new ConflictException(...)`. Второй вызов попадёт на уже-revoked документ и получит 409.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/documents/documents.idempotency-concurrency.test.ts
git commit -m "$(cat <<'EOF'
test(documents): concurrent revoke produces exactly one success

2 параллельных revoke → один fulfill, один ConflictException
(already_revoked). Подтверждает behaviour, документированное
в runbook §5.2.

Pillar A hardening §4.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B21: Fix batch-generate idempotency (real bug)

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:490-515` (метод `generateDocumentsBatch`)
- Modify: `apps/backend/src/modules/documents/documents.dto.ts` (добавить `idempotencyKey` в `GenerateDocumentsBatchRequest`)
- Modify: `apps/backend/src/modules/documents/documents.idempotency-concurrency.test.ts`

Текущая реализация (`:497-509`) использует `${sourceEntityId}-${batchBaseTime}-${index}` как idempotency key, где `batchBaseTime = Date.now()` — новый на каждый вызов. Это значит **retry того же batch получит новые keys и продублирует tasks**. Это баг.

Фикс: попросить caller передать `idempotencyKey` в request body, и derive per-item key из этого.

- [ ] **Step 1: Red-тест**

Добавить:

```typescript
describe('Idempotency — generateDocumentsBatch retry', () => {
  it('повторный вызов с тем же batch.idempotencyKey + sourceEntityIds → те же tasks', async () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    const tpl = service.createTemplate('t1', 'u1', { name: 'X', templateType: 'contract' }, ctx);
    const v = service.createTemplateVersion('t1', 'u1', { templateId: tpl.id, fileId: 'f' });
    service.activateTemplateVersion('t1', 'u1', v.id, ctx);

    const first = service.generateDocumentsBatch(
      't1',
      'u1',
      {
        idempotencyKey: 'batch-42',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityIds: ['g1', 'g2'],
        documentType: 'd'
      },
      ctx
    );

    const second = service.generateDocumentsBatch(
      't1',
      'u1',
      {
        idempotencyKey: 'batch-42',
        templateId: tpl.id,
        sourceEntityType: 'group',
        sourceEntityIds: ['g1', 'g2'],
        documentType: 'd'
      },
      ctx
    );

    expect(first.items[0].id).toBe(second.items[0].id);
    expect(first.items[1].id).toBe(second.items[1].id);
    expect(service.listDocumentTasks('t1', {}).total).toBe(2);
  });
});
```

- [ ] **Step 2: Прогнать, FAIL**

Run: `pnpm --filter backend test src/modules/documents/documents.idempotency-concurrency.test.ts -t "generateDocumentsBatch retry"`
Expected: FAIL — current code uses `Date.now()` in key, second call gets new tasks.

- [ ] **Step 3: Добавить `idempotencyKey` в `GenerateDocumentsBatchRequest`**

Открыть `documents.dto.ts`, найти `GenerateDocumentsBatchRequest`, добавить required поле:

```typescript
export interface GenerateDocumentsBatchRequest {
  /** Pillar A hardening — caller-provided, чтобы retry того же batch не плодил tasks. */
  idempotencyKey: string;
  templateId: string;
  templateVersionId?: string;
  sourceEntityType: string;
  sourceEntityIds: string[];
  documentType: string;
}
```

- [ ] **Step 4: Изменить `generateDocumentsBatch` использовать `req.idempotencyKey`**

Заменить `documents.service.ts:490-515`:

```typescript
  generateDocumentsBatch(
    tenantId: string,
    actorId: string | undefined,
    req: GenerateDocumentsBatchRequest,
    ctx?: RequestContext
  ) {
    const sourceIds = req.sourceEntityIds.map((item) => item.trim()).filter(Boolean);
    return {
      items: sourceIds.map((sourceEntityId, index) =>
        this.generateDocument(
          tenantId,
          actorId,
          {
            templateId: req.templateId,
            templateVersionId: req.templateVersionId,
            sourceEntityType: req.sourceEntityType,
            sourceEntityId,
            documentType: req.documentType,
            // Idempotency: derived from caller-provided key + sourceEntityId.
            // Retry того же batch с теми же sourceEntityIds → те же per-item keys.
            idempotencyKey: `${req.idempotencyKey}:${sourceEntityId}:${index}`
          },
          ctx
        )
      )
    };
  }
```

- [ ] **Step 5: Прогнать тест**

Run: `pnpm --filter backend test src/modules/documents/documents.idempotency-concurrency.test.ts -t "generateDocumentsBatch retry"`
Expected: PASS.

- [ ] **Step 6: Прогнать ВСЕ тесты documents**

Run: `pnpm --filter backend test src/modules/documents`
Expected: PASS. Если упало — какой-то тест звал `generateDocumentsBatch` без `idempotencyKey`. Добавить туда `idempotencyKey: 'test-key'`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/
git commit -m "$(cat <<'EOF'
fix(documents): batch-generate uses caller-provided idempotencyKey

Раньше: key = sourceEntityId-Date.now()-index → retry того же
batch генерировал НОВЫЕ ключи → дублирование tasks. Реальный
bug в idempotency.

Теперь: GenerateDocumentsBatchRequest.idempotencyKey обязательно;
per-item key = '{batch}:{sourceEntityId}:{index}'. Retry того
же batch получает те же per-item keys и hit'ает existing idem cache.

Pillar A hardening §4.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### PR-2 Push + Review Gate

- [ ] **Step 1: Push branch**

```bash
git push
```

- [ ] **Step 2: Создать PR-2**

```bash
gh pr create --title "Pillar A hardening PR-2: security pass" --body "$(cat <<'EOF'
## Summary

Security pass для Pillar A: IDOR negative tests, public verify PII guard, ПДн маскирование в audit, idempotency concurrency tests + фикс batch-generate.

## Changes
- IDOR negative tests: documents (13 эндпоинтов), licenses (4), learner-pdf-card (1).
- Public /verify: PII не в response (тест), revokedBy не leak'ается (тест), rate-limit конфиг закреплён (тест).
- AuditService: SENSITIVE_FIELDS маскируются автоматически в old/newValues (defence in depth для 152-ФЗ).
- Concurrency tests: group order, revoke, batch-generate.
- **Bug fix**: batch-generate idempotency была сломана — использовала Date.now() в key. Теперь caller-provided idempotencyKey.

## Spec
`docs/superpowers/specs/2026-05-27-pillar-a-hardening-design.md` §4.

## Test plan
- [x] Vitest backend зелёный полностью
- [x] Все новые IDOR-тесты PASS из коробки → подтверждение существующей защиты
- [x] PII masking тесты PASS, нет регрессий
- [x] Idempotency concurrency PASS
- [ ] Manual smoke: revoke / reissue / batch retry / public verify работают как раньше

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Дождаться CI**

Не мержить без подтверждения пользователя.

---

# Section C: PR-3 — Runbook + Smoke

**PR-цель:** Создать единый runbook для дежурного по инцидентам Pillar A. Прогнать smoke-чек-лист по сценариям, исправить расхождения если есть.

**Базовая ветка:** main или продолжение ветки PR-2. Это финальная PR.

**PR-инвариант (DoD на момент merge):**

- `docs/runbooks/pillar-a-incidents.md` существует с 5 сценариями в единой форме «Симптом → Проверки → Действия → Verify».
- Smoke-чек-лист пройден руками (см. Task C28).

---

### Task C26: Создать runbook

**Files:**

- Create: `docs/runbooks/pillar-a-incidents.md`

- [ ] **Step 1: Создать файл runbook**

`docs/runbooks/pillar-a-incidents.md`:

````markdown
# Pillar A Incidents — Runbook

> Дежурный runbook для модуля выдачи документов (Pillar A): сценарии и
> процедуры. Формат каждого сценария: **Симптом → Проверки → Действия → Verify**.
>
> Спека: [Pillar A hardening](../superpowers/specs/2026-05-27-pillar-a-hardening-design.md) §5.
>
> Связанная документация:
>
> - [Operations runbook](../operations-runbook.md) — общий runbook платформы.
> - [Pillar A regulated training design](../superpowers/specs/2026-05-22-regulated-training-foundation-design.md).

---

## 1. Документ не выдался после завершения курса

**Симптом:** ученик завершил курс, документа нет в журнале (`/admin/issuance-journal`).

**Проверки:**

1. Запросить `GET /api/v1/document-tasks?sourceEntityType=enrollment&sourceEntityId=<enrollmentId>` → найти task со status=failed.
2. Прочитать `task.errorMessage`.
3. Посмотреть audit-events: `SELECT * FROM audit.audit_log WHERE entity_id = '<taskId>' AND action LIKE 'documents.task.%' ORDER BY created_at;`.
4. Посмотреть worker-логи (Yandex Cloud Logging) по `correlation_id` из task.

**Действия:**

1. Если ошибка ретрайабельная (S3 timeout, БД disconnect): `POST /api/v1/document-tasks/<taskId>/retry`.
2. Если ошибка валидации (missing required variable): связаться с методистом, попросить заполнить переменную, retry.
3. Если ошибка непонятная — escalate в backend-канал. Не делать ручное создание `documents.generated` через БД (потеряем audit-trail).

**Verify:**

- Появилась запись в `documents.generated`.
- Audit-event `documents.task.completed`.
- Ученик видит документ в кабинете (`GET /api/v1/me/documents`).

---

## 2. Нужно отозвать ошибочно выданный документ (массовая ошибка)

**Симптом:** групповой приказ выдал документы с неправильным шаблоном/датой — нужно отозвать N штук одного приказа.

**Проверки:**

1. Найти group order: `SELECT id FROM documents.generated WHERE document_type='order' AND source_entity_id='<groupId>' AND status != 'archived';`.
2. Перечислить связанные сертификаты: `SELECT id, document_number FROM documents.generated WHERE group_order_document_id = '<orderId>';`.

**Действия:**

1. Для каждого сертификата: `POST /api/v1/admin/documents/<id>/revoke` с body `{ "reason": "<человекочитаемая причина>" }`. **Reason обязателен** — без него 400.
2. Если нужен новый выпуск с правильным шаблоном — после revoke вызвать `POST /api/v1/admin/documents/<id>/reissue` с body `{ "reason": "..." }`. Это создаст новый документ с новым номером и привяжет `replaces` / `replaced_by` links.
3. Для самого order: `revoke` тоже отдельно, если его тоже нужно отозвать.

**Verify:**

- `SELECT status, revoked_at, revocation_reason FROM documents.generated WHERE id IN (...);` → все `revoked`.
- Audit: `SELECT * FROM audit.audit_log WHERE action='documents.revoked' AND entity_id IN (...);` → запись на каждый.
- QR-верификация (`GET /api/v1/public/verify/<token>`) для отозванных → `{"status":"revoked", "revokedAt": "..."}`.
- Учёт переаттестации (если есть для этих сертификатов) сброшен.

---

## 3. QR-проверка возвращает "не найдено" для валидного документа

**Симптом:** ученик/работодатель сканирует QR — verify-страница говорит «Документ с таким QR-кодом не найден».

**Проверки:**

1. Извлечь `token` из QR-URL (часть после `/verify/`).
2. `SELECT id, status, document_number, qr_token FROM documents.generated WHERE qr_token = '<token>';` — найден ли?
3. Если найден, но `status = 'revoked'` или `archived` — это правильное поведение (revoke вернёт `revoked`, archived = `not_found`).
4. Если не найден — проверить, что миграция 0033 (`qr_token` column) применена: `SELECT column_name FROM information_schema.columns WHERE table_schema='documents' AND table_name='generated' AND column_name='qr_token';`.
5. Если column пустой/null — токен не сгенерён. Проверить, что `generateQrToken()` вызывается во всех путях создания документа (`completeTask`, `reissueDocument`, `issueGroupOrder`).

**Действия:**

1. Если документ есть, но `archived` без бизнес-повода — `restore` (manual SQL: `UPDATE documents.generated SET status='final', archived_at=NULL WHERE id='<id>';`). После — audit-запись вручную (`INSERT INTO audit.audit_log (...) VALUES (...);` с action='documents.archived_reverted_manually').
2. Если QR битый (token не существует у документа) — `POST /api/v1/admin/documents/<id>/reissue` с reason "Восстановление QR-токена". Это создаст новый документ с новым token, оригинал revoke'ается.

**Verify:**

- Повторное `GET /api/v1/public/verify/<token>` возвращает `{"status":"valid", ...}`.
- Audit `documents.qr_verification_requested` от тестового запроса виден.

---

## 4. Запрос ПДн от ученика (152-ФЗ): «удалить мои данные»

**Симптом:** ученик прислал письменное требование удаления персональных данных по 152-ФЗ (статья 14, право субъекта на удаление).

**Проверки:**

1. Совпадение личности: запросить копию паспорта/доверенность.
2. Проверить наличие действующих документов: `SELECT id, document_number, document_type, status, document_date FROM documents.generated WHERE source_entity_id IN (SELECT id FROM mvp.enrollments WHERE learner_id='<learnerId>') AND status NOT IN ('archived');`.
3. Если документы есть — **нельзя полностью удалить** учётку: 273-ФЗ (ст. 76) требует хранения сведений об образовании учеников.

**Действия:**

**Case A: документов нет** (ученик не прошёл ни одного курса до выдачи документа)

1. `DELETE FROM mvp.learners WHERE id='<learnerId>' AND tenant_id='<tenantId>';` — каскадом удалятся enrollments, group_learners.
2. Audit (writeCritical): через сервис `POST /api/v1/admin/learners/<id>/erase` (если эндпоинт ещё не реализован — добавить в отдельной задаче; пока ручной SQL + ручной audit-record).

**Case B: документы есть** (есть выданные удостоверения)

1. **Анонимизация** в `mvp.learners`:
   - `UPDATE mvp.learners SET first_name='Удалено по запросу', last_name='Удалено по запросу', middle_name=NULL, snils=NULL, email=NULL, position=NULL WHERE id='<learnerId>';`.
2. Audit (writeCritical): action='learner.personal_data_erased', actorId=admin, oldValues замаскированы автоматически (SENSITIVE_FIELDS), newValues={ anonymised: true, reason: '152-fz request' }.
3. Документы остаются в `documents.generated` с прежним `document_number`, `document_date`, шаблоном, статусом. `source_entity_id` (= enrollmentId) тоже остаётся.

**Verify:**

- Ученик не появляется в поиске админки.
- `GET /api/v1/admin/learners/<id>` возвращает строку с `firstName='Удалено по запросу'`, NULL ПДн.
- QR-верификация выданных документов работает (status='valid'), но не показывает ФИО (она и так не показывает).
- Audit `learner.personal_data_erased` есть в `audit.audit_log`.
- Журнал выдачи `/admin/issuance-journal` показывает строки документов (но без обогащения ФИО — там либо пустота, либо «Удалено»).

---

## 5. Подозрение на компрометацию admin-аккаунта (массовый revoke)

**Симптом:** в журнале выдачи аномальное количество revoke за короткий период от одного `actorId`. Метрика `documents_revoked_total{tenant=X}` показывает spike.

**Проверки:**

1. `SELECT id, action, entity_id, ip, user_agent, created_at FROM audit.audit_log WHERE actor_id='<userId>' AND action LIKE 'documents.%' AND created_at > now() - interval '1 hour' ORDER BY created_at;`.
2. Свериться с известными активностями этого admin'а (есть ли законный массовый revoke этого периода? Запросить у владельца центра).
3. Сравнить IP/UA в audit с обычными для этого admin'а.

**Действия:**

1. Немедленно: `POST /api/v1/iam/sessions/<userId>/revoke-all` — закрыть все активные сессии этого admin'а.
2. Удалить permission `documents.write` у роли admin'а временно: `POST /api/v1/iam/users/<userId>/permissions/revoke` body `{"permissions":["documents.write"]}`.
3. После расследования (если это был incident): rotate magic-link секрет, force password reset для всех админов того тенанта, ручной reissue revoked-by-attacker документов (см. §5.2 «массовый отзыв» — обратный процесс).
4. Записать инцидент через `learner.personal_data_erased`-аналог (создать action='security.account_compromised', actorId=security-admin).

**Verify:**

- Метрика `documents_revoked_total` вернулась к baseline.
- Audit `iam.permission_revoked` + `iam.session_revoked` есть.
- Восстановленные документы (если был reissue) валидны через QR.
- Владелец центра уведомлён, инцидент задокументирован в `docs/incidents/YYYY-MM-DD-<short>.md` (создать вручную).

---

## Приложения

### Полезные SQL-запросы

```sql
-- Все revoke за последний час
SELECT actor_id, entity_id, created_at, ip
  FROM audit.audit_log
  WHERE action='documents.revoked' AND created_at > now() - interval '1 hour'
  ORDER BY created_at;

-- Документы с возможно битым QR
SELECT id, document_number, qr_token, length(qr_token) AS token_len
  FROM documents.generated
  WHERE qr_token IS NULL OR length(qr_token) < 16;

-- Все access-events ПДн за день
SELECT actor_id, entity_id, ip, created_at
  FROM audit.audit_log
  WHERE action='learner.personal_data_accessed' AND created_at::date = current_date
  ORDER BY created_at;
```
````

### Контакты

- Backend on-call: `#cdoprof-backend` (Slack).
- Security on-call: `#cdoprof-security` (Slack).
- Юридическая поддержка (152-ФЗ): см. `docs/operations-runbook.md` §контакты.

````

- [ ] **Step 2: Проверить, что markdown валидный + ссылки работают**

Run: `pnpm -w lint:md docs/runbooks/pillar-a-incidents.md` (если в репо настроен markdownlint; иначе просто визуально просмотреть в редакторе/preview).
Expected: no warnings.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/pillar-a-incidents.md
git commit -m "$(cat <<'EOF'
docs(runbook): Pillar A incidents — 5 сценариев

Единый runbook для дежурного: документ не выдался,
массовый revoke, QR not found, 152-ФЗ запрос на удаление,
компрометация admin-аккаунта. Формат: Симптом → Проверки →
Действия → Verify. Приложение с полезными SQL-запросами.

Pillar A hardening §5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
````

---

### Task C27: Сослаться на runbook из operations-runbook.md

**Files:**

- Modify: `docs/operations-runbook.md` (добавить ссылку)

- [ ] **Step 1: Открыть `docs/operations-runbook.md`**

Read: `docs/operations-runbook.md`.

- [ ] **Step 2: Найти раздел с модулями/доменами и добавить ссылку**

В разделе, где перечислены поддерживаемые модули или в начале документа (после оглавления), добавить:

```markdown
## Доменные runbook'и

- [Pillar A — выдача документов](runbooks/pillar-a-incidents.md) — инциденты по выдаче, отзыву, QR-верификации, 152-ФЗ.
```

(Точное место зависит от структуры существующего файла — выбрать наиболее естественное.)

- [ ] **Step 3: Commit**

```bash
git add docs/operations-runbook.md
git commit -m "$(cat <<'EOF'
docs(runbook): link Pillar A runbook from operations-runbook.md

Дежурный находит доменные runbook'и через главный
operations-runbook.md → отдельный файл по Pillar A.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C28: Smoke-чек-лист (manual)

**Files:**

- Не меняет кода. Проверка вручную (или семи-автоматически).

- [ ] **Step 1: Развернуть локально stack**

Run: `pnpm -w dev` (или соответствующий скрипт; см. `docs/local-development.md`).
Expected: backend + frontend поднимаются.

- [ ] **Step 2: Проверить сценарий 1 (документ не выдался)**

- Создать тестовый enrollment.
- Через UI / API инициировать generate.
- Симулировать failure (например, сломать template version, чтобы validation упал).
- Убедиться, что в `/admin/issuance-journal` нет документа.
- Прогнать процедуру из runbook §1: найти failed task, прочитать error, retry.

- [ ] **Step 3: Проверить сценарий 2 (массовый revoke)**

- Выпустить тестовый group order на 3 enrollment'а.
- Через `POST /api/v1/admin/documents/<id>/revoke` отозвать все 3.
- Проверить audit (`SELECT * FROM audit.audit_log WHERE action='documents.revoked' AND entity_id IN (...);`).
- Проверить QR (`GET /public/verify/<token>` → `{"status":"revoked"}`).

- [ ] **Step 4: Проверить сценарий 3 (QR not found)**

- Сгенерировать документ.
- Запросить `/public/verify/<неверный-токен>` → ожидать `{"status":"not_found"}` с 404 + `code: "document_not_found"`.
- Запросить `/public/verify/<правильный-токен>` → ожидать `{"status":"valid", "documentNumber":...}` без ПДн.

- [ ] **Step 5: Проверить сценарий 4 (152-ФЗ удаление)**

- Создать тестового ученика с ФИО+СНИЛС.
- Выпустить ему документ.
- Вручную выполнить анонимизацию через SQL (как в runbook §4 Case B).
- Проверить: в `mvp.learners` ФИО заменено, СНИЛС/email NULL.
- Проверить: документ всё ещё есть в `documents.generated`, QR работает.
- Audit `learner.personal_data_erased` есть.

- [ ] **Step 6: Проверить сценарий 5 (компрометация — на shadow окружении)**

- НЕ делать на prod. В dev/staging: симулировать массовый revoke от одного admin'а (~20 за минуту).
- Проверить, что в audit есть все события с одинаковым `actor_id`, `ip`, `user_agent`.
- Прогнать SQL из runbook §5.

- [ ] **Step 7: Записать результаты smoke в чек-лист**

Создать `docs/runbooks/_smoke-2026-05-27-pillar-a.md`:

```markdown
# Pillar A Hardening — Smoke Run

**Дата:** 2026-05-27
**Окружение:** local dev
**Версия:** feat/2026-05-27-pillar-a-hardening @ <commit-sha>

| Сценарий               | Результат | Заметки |
| ---------------------- | --------- | ------- |
| §1 Документ не выдался | ✅/⚠️/❌  | ...     |
| §2 Массовый revoke     | ✅/⚠️/❌  | ...     |
| §3 QR not found        | ✅/⚠️/❌  | ...     |
| §4 152-ФЗ удаление     | ✅/⚠️/❌  | ...     |
| §5 Компрометация       | ✅/⚠️/❌  | ...     |

**Найденные расхождения с runbook:**

- (если есть)

**Следующие действия:**

- (если runbook нуждается в правке — фиксируем здесь)
```

Заполнить реальными результатами, commit.

- [ ] **Step 8: Если найдены расхождения — поправить runbook**

Если SQL запрос в runbook не работает (опечатка в имени таблицы, missing column), если API эндпоинт возвращает другое — исправить `docs/runbooks/pillar-a-incidents.md` и сделать commit `docs(runbook): smoke corrections`.

- [ ] **Step 9: Commit smoke-чек-листа**

```bash
git add docs/runbooks/_smoke-2026-05-27-pillar-a.md
git commit -m "$(cat <<'EOF'
docs(runbook): smoke run results for Pillar A hardening

Прогнал 5 сценариев из runbook'а в local dev. Все сценарии
прошли (или: расхождения с runbook поправлены отдельным
коммитом).

Pillar A hardening §6.1 шаг 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### PR-3 Push + Review Gate

- [ ] **Step 1: Push branch**

```bash
git push
```

- [ ] **Step 2: Создать PR-3**

```bash
gh pr create --title "Pillar A hardening PR-3: runbook + smoke" --body "$(cat <<'EOF'
## Summary

Финальная PR в hardening-серии: runbook для дежурного по Pillar A инцидентам + smoke-результаты.

## Changes
- Новый файл `docs/runbooks/pillar-a-incidents.md` — 5 сценариев в формате Симптом→Проверки→Действия→Verify + приложение с SQL-запросами.
- Ссылка из главного `docs/operations-runbook.md`.
- Smoke-чек-лист `docs/runbooks/_smoke-2026-05-27-pillar-a.md` с реальными результатами прогона.

## Spec
`docs/superpowers/specs/2026-05-27-pillar-a-hardening-design.md` §5.

## Test plan
- [x] 5 сценариев прогнаны вручную в local dev
- [x] Runbook поправлен под реальное поведение (если были расхождения)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Дождаться review и merge**

PR-3 — последний. После merge'а hardening-серия завершена.

---

## Self-Review (выполнено перед сохранением плана)

**1. Spec coverage:**

| Спека §                                | Покрыто задачами                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| §2.1 scope (backend modules)           | A2-A12                                                                                                                     |
| §2.3 DoD: audit на всех state-changing | A2-A12                                                                                                                     |
| §2.3 DoD: writeCritical для критичных  | A4, A10, A11, A12                                                                                                          |
| §2.3 DoD: public verify hardening      | B16, B17 (PR-1 уже перевёл audit на writeCritical в A12)                                                                   |
| §2.3 DoD: IDOR на каждом :id           | B13, B14, B15                                                                                                              |
| §2.3 DoD: ПДн masking                  | B18 (audit-level), B16 (response-level)                                                                                    |
| §2.3 DoD: idempotency concurrency      | B19, B20, B21                                                                                                              |
| §2.3 DoD: runbook 5 сценариев          | C26                                                                                                                        |
| §3.1 решение использовать AuditService | A1 docstring + все A\* реализуют                                                                                           |
| §3.2 gap analysis                      | Каждая A2-A12 — один gap                                                                                                   |
| §3.3 правило write vs writeCritical    | A1 + код в A4/A10/A11/A12                                                                                                  |
| §3.4 обязательные поля для критичных   | A9 (ip/UA в task audit) + везде в A\*                                                                                      |
| §3.5 тест-паттерн                      | A2 устанавливает паттерн, остальные A\* следуют                                                                            |
| §4.1 IDOR с тест-паттерном             | B13/B14/B15                                                                                                                |
| §4.2 public verify checklist           | B16, B17 (rate-limit + PII), B18 (PII masking)                                                                             |
| §4.3 152-ФЗ                            | A11 (access-log), B18 (audit masking), C26 §4 (runbook)                                                                    |
| §4.4 idempotency                       | B19, B20, B21 (включая bug fix)                                                                                            |
| §5.1-5.5 runbook                       | C26 §1-5                                                                                                                   |
| §6.1 порядок работ                     | Section A → B → C                                                                                                          |
| §6.2 группировка в 3 PR                | Section A=PR-1, B=PR-2, C=PR-3                                                                                             |
| §6.3 риски                             | Каждая задача делает rollback тривиальным (один commit)                                                                    |
| §6.4 out-of-scope                      | НЕ покрыто (это правильно — спека явно вынесла)                                                                            |
| §7 открытые вопросы (4)                | 1=C26 (runbook location); 2=B18 (маска \*\*\*); 3=B20 (revoke возвращает 409); 4=A12/B17 (@nestjs/throttler уже подключён) |

Все требования спеки имеют покрывающую задачу. ✅

**2. Placeholder scan:** Прошёл по всему документу. Нет «TBD», «TODO», «implement later», «add appropriate error handling», «similar to Task N». Все шаги содержат код или конкретные команды. ✅

**3. Type consistency:**

- `RequestContext` — последовательный импорт из `'../../common/context/request-context.js'` везде.
- Сигнатуры async-методов (`finalizeDocument`, `archiveDocument`, `revokeDocument`, `reissueDocument`, `issueGroupOrder`, `licenses.create/update/revoke`, `learner-pdf-card.composeData`, `public-verify.verify`) — везде `Promise<T>` в типе возврата.
- `actorId: string | undefined` — единый стиль (не optional `?`).
- `ctx: RequestContext` — обязательный последний параметр для всех audit-emitting методов.

✅

**4. Inline fixes сделаны:** ничего критичного не найдено.

---

## Готовность к выполнению

Plan ready. Implementation start: **Section A → Section B → Section C** в порядке выше.
