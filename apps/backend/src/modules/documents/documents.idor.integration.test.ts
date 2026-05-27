import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

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
