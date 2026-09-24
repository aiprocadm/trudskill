import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_KINDS,
  assertDocumentKindFitsTemplate,
  documentKindOf
} from './document-kinds.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { TemplateType } from './documents.types.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  tenantId: T,
  userId: 'u_tenant_admin',
  roles: [],
  permissions: [],
  method: 'POST',
  path: '/api/v1/documents',
  timestamp: new Date().toISOString()
};

const makeService = () =>
  new DocumentsService(
    new InMemoryDocumentsState(),
    new AuditService(),
    new RealtimeEventsService()
  );

const activeTemplate = (service: DocumentsService, templateType: TemplateType, name: string) => {
  const template = service.createTemplate(T, 'u_tenant_admin', { name, templateType }, ctx);
  const version = service.createTemplateVersion(T, 'u_tenant_admin', {
    templateId: template.id,
    fileId: `file_${name}`
  });
  service.activateTemplateVersion(T, 'u_tenant_admin', version.id, ctx);
  return template;
};

describe('виды документов (МГ-F1.1, срез 18.1)', () => {
  it('каталог — 14 видов CDOPROF (ТЗ §9.1), коды уникальны, у каждого вида тип движка', () => {
    expect(DOCUMENT_KINDS).toHaveLength(14);
    expect(new Set(DOCUMENT_KINDS.map((k) => k.code)).size).toBe(14);
    expect(DOCUMENT_KINDS.filter((k) => k.templateType === 'order').map((k) => k.code)).toEqual([
      'order.enrollment',
      'order.commission',
      'order.admission',
      'order.workload',
      'order.completion'
    ]);
    expect(documentKindOf('certificate.ot')).toMatchObject({
      templateType: 'certificate',
      scope: 'learner_course',
      requiresProtocol: true,
      numbering: 'protocol_suffix'
    });
    expect(documentKindOf('nope')).toBeUndefined();
  });

  it('вид и шаблон: неизвестный вид и чужой тип шаблона — понятный отказ', () => {
    expect(assertDocumentKindFitsTemplate('protocol.knowledge_check', 'protocol').name).toBe(
      'Протокол проверки знаний'
    );
    expect(() => assertDocumentKindFitsTemplate('certificate.ot', 'order', 'Приказ')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_kind_template_mismatch' })
      })
    );
    expect(() => assertDocumentKindFitsTemplate('order.nope', 'order')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_kind_unknown' })
      })
    );
  });

  it('привязка шаблона помнит вид; выпуск несёт вид в задачу и на документ', () => {
    const service = makeService();
    service.createNumberingRule(T, { documentType: 'certificate', prefix: 'У-' });
    const certificate = activeTemplate(service, 'certificate', 'Удостоверение');
    const binding = service.createTemplateBinding(
      T,
      'u_tenant_admin',
      {
        templateId: certificate.id,
        bindType: 'course',
        courseId: 'course_1',
        kindCode: 'certificate.ot'
      },
      ctx
    );
    expect(binding.kindCode).toBe('certificate.ot');
    expect(() =>
      service.createTemplateBinding(
        T,
        'u_tenant_admin',
        {
          templateId: certificate.id,
          bindType: 'course',
          courseId: 'course_1',
          kindCode: 'order.enrollment'
        },
        ctx
      )
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_kind_template_mismatch' })
      })
    );

    const task = service.generateDocument(T, 'u_tenant_admin', {
      idempotencyKey: 'kind-1',
      templateId: certificate.id,
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_1',
      documentType: 'certificate',
      kindCode: 'certificate.ot'
    });
    expect(task.kindCode).toBe('certificate.ot');
    service.startTask(T, task.id);
    const generated = service.completeTask(T, task.id, 'file_out_1');
    expect(service.getDocument(T, generated.id).kindCode).toBe('certificate.ot');
  });
});
