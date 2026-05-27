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
  service.activateTemplateVersion('t1', 'u1', version.id, ctx);
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
    service.activateTemplateVersion('t1', 'u1', orderV.id, ctx);
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
    service.activateTemplateVersion('t1', 'u1', certV.id, ctx);
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

describe('Audit completeness — task audit includes ip/userAgent', () => {
  it('writeTaskAudit on completeTask includes ip/userAgent from original request', async () => {
    const { audit } = makeServiceWithDoc();
    const events = audit['records'].filter((e) => e.action === 'documents.task.completed');
    expect(events).toHaveLength(1);
    expect(events[0].ip).toBe('127.0.0.1');
    expect(events[0].userAgent).toBe('vitest');
  });
});
