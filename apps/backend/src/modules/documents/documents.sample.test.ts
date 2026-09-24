import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { SAMPLE_DOCUMENT_NUMBER } from './numbering-format.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { REQUIRED_PERMISSIONS } from '../iam/permission.decorator.js';

import type { RequestContext } from '../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_tenant_admin'
} as RequestContext;

const make = () => {
  const state = new InMemoryDocumentsState();
  const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
  return { state, service };
};

/** МГ-F5.1 (ТЗ перехода с CDOPROF, Фаза 3, срез 20.2): образец документа без номера. */
describe('образец документа на настоящих данных (МГ-F5.1, срез 20.2)', () => {
  it('задача-образец собирается в памяти: ни задачи в очереди, ни резерва номера', () => {
    const { state, service } = make();
    const template = service.createTemplate(
      T,
      ctx.userId,
      { name: 'Удостоверение ОТ', templateType: 'certificate' },
      ctx
    );
    const version = service.createTemplateVersion(T, ctx.userId, {
      templateId: template.id,
      fileId: 'file_cert'
    });
    service.activateTemplateVersion(T, ctx.userId, version.id, ctx);

    const { task, fileId } = service.sampleTask(T, {
      templateId: template.id,
      groupId: 'g1',
      enrollmentId: 'e1',
      kindCode: 'certificate.ot'
    });
    expect(fileId).toBe('file_cert');
    expect(task).toMatchObject({
      documentType: 'certificate',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'e1',
      groupId: 'g1',
      kindCode: 'certificate.ot'
    });
    expect(task.numberReservationId).toBeUndefined();
    expect(state.tasks).toHaveLength(0);
    expect(state.reservations).toHaveLength(0);
    expect(SAMPLE_DOCUMENT_NUMBER).toBe('ОБРАЗЕЦ');
  });

  it('без бланка — понятный отказ; вид чужого типа — отказ с названием шаблона', () => {
    const { service } = make();
    const empty = service.createTemplate(
      T,
      ctx.userId,
      { name: 'Приказ без бланка', templateType: 'order' },
      ctx
    );
    expect(() => service.sampleTask(T, { templateId: empty.id, groupId: 'g1' })).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'template_version_missing' })
      })
    );
    const version = service.createTemplateVersion(T, ctx.userId, {
      templateId: empty.id,
      fileId: 'file_order'
    });
    service.activateTemplateVersion(T, ctx.userId, version.id, ctx);
    expect(() =>
      service.sampleTask(T, { templateId: empty.id, groupId: 'g1', kindCode: 'certificate.ot' })
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_kind_template_mismatch' })
      })
    );
  });

  it('образец — под правом выпуска документов (в нём персональные данные группы)', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, DocumentsController.prototype.sampleDocument)
    ).toEqual(['documents.generate']);
  });
});
