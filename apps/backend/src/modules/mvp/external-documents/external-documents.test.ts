import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { ExternalDocumentsController } from './external-documents.controller.js';
import { AuditService } from '../../audit/audit.service.js';
import { RealtimeEventsService } from '../../core/realtime-events.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { InMemoryDocumentsState } from '../../documents/in-memory-documents.state.js';
import { REQUIRED_PERMISSIONS } from '../../iam/permission.decorator.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { RequestContext } from '../../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_methodist'
} as RequestContext;

const make = () => {
  const docState = new InMemoryDocumentsState();
  const documents = new DocumentsService(docState, new AuditService(), new RealtimeEventsService());
  const state = new InMemoryMvpState();
  state.learners.push({ id: 'l1', tenantId: T, lastName: 'Иванов', firstName: 'Иван' } as never);
  state.enrollments.push(
    {
      id: 'e_old',
      tenantId: T,
      groupId: 'g_old',
      learnerId: 'l1',
      enrolledAt: '2025-01-10'
    } as never,
    {
      id: 'e_new',
      tenantId: T,
      groupId: 'g_new',
      learnerId: 'l1',
      enrolledAt: '2026-03-10'
    } as never
  );
  const files = {
    getAntivirusStatus: vi.fn().mockResolvedValue('pending'),
    scanFile: vi.fn().mockResolvedValue('clean'),
    createUploadIntent: vi.fn()
  };
  const controller = new ExternalDocumentsController(state, documents, files as never);
  return { controller, documents, docState, files };
};

const body = (over: Record<string, unknown> = {}) => ({
  kindCode: 'certificate.ot',
  number: '264501-3',
  date: '2025-02-01',
  learnerId: 'l1',
  series: 'АБ',
  validUntil: '2028-02-01',
  sourceSystem: 'cdoprof',
  externalId: 'cd-77',
  ...over
});

/** МГ-F4.1 (ТЗ перехода с CDOPROF, Фаза 3, срез 22.1): внешние документы. */
describe('внешние документы (МГ-F4.1, срез 22.1)', () => {
  it('вносится реквизитами на запись слушателя: вид, номер, дата, серия, срок; «внешний»', () => {
    const { controller } = make();
    const doc = controller.register(ctx, body());
    expect(doc).toMatchObject({
      isExternal: true,
      documentType: 'certificate',
      kindCode: 'certificate.ot',
      documentNumber: '264501-3',
      documentDate: '2025-02-01',
      series: 'АБ',
      validUntil: '2028-02-01',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'e_new',
      status: 'final',
      sourceSystem: 'cdoprof',
      externalId: 'cd-77'
    });
    // Группа названа — запись этой группы.
    const inGroup = controller.register(
      ctx,
      body({ number: '1', externalId: 'cd-78', groupId: 'g_old' })
    );
    expect(inGroup.sourceEntityId).toBe('e_old');
  });

  it('повторный импорт того же документа не плодит дублей; номер вида занят — отказ; у другого вида — можно', () => {
    const { controller, docState } = make();
    const first = controller.register(ctx, body());
    expect(controller.register(ctx, body()).id).toBe(first.id);
    expect(() => controller.register(ctx, body({ externalId: 'cd-99' }))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_number_taken' })
      })
    );
    const protocol = controller.register(
      ctx,
      body({ kindCode: 'protocol.knowledge_check', externalId: 'cd-100', number: '264501-3' })
    );
    expect(protocol.documentType).toBe('protocol');
    // Резерв «использован» — номер защищён заявкой 0088 и в пределах вида.
    expect(docState.reservations.map((r) => [r.reservedNumber, r.kindCode, r.status])).toEqual([
      ['264501-3', 'certificate.ot', 'used'],
      ['264501-3', 'protocol.knowledge_check', 'used']
    ]);
  });

  it('слушатель не найден или не в группе — понятный отказ', () => {
    const { controller } = make();
    expect(() => controller.register(ctx, body({ learnerId: 'l_x' }))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'external_document_learner_not_found' })
      })
    );
    expect(() => controller.register(ctx, body({ groupId: 'g_x' }))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'external_document_learner_not_in_group' })
      })
    );
  });

  it('не перевыпускается движком; скан загружается; из выгрузок в реестры исключён', async () => {
    const { controller, documents, files } = make();
    const doc = controller.register(ctx, body());
    await expect(documents.reissueDocument(T, 'u', doc.id, 'утеря', ctx)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'external_document_not_reissuable' })
    });
    const scanned = await controller.attachScan(ctx, doc.id, { fileId: 'file_scan' });
    expect(scanned).toMatchObject({ fileId: 'file_scan', externalFileId: 'file_scan' });
    expect(files.scanFile).toHaveBeenCalledWith(T, 'file_scan', ctx.userId);
    expect(documents.listIssuedDocuments(T, {}).items.map((d) => d.id)).toEqual([doc.id]);
    expect(documents.listIssuedDocuments(T, { excludeExternal: true }).items).toEqual([]);
  });

  it('скан — только к внешнему документу', () => {
    const { documents, docState } = make();
    docState.generatedDocuments.push({ id: 'gdoc_own', tenantId: T, status: 'final' } as never);
    expect(() => documents.attachExternalScan(T, 'u', 'gdoc_own', 'f', ctx)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_not_external' })
      })
    );
  });

  it('ручки — под правом документов (documents.write, ТЗ §16)', () => {
    for (const handler of ['register', 'uploadUrl', 'attachScan'] as const) {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS, ExternalDocumentsController.prototype[handler])
      ).toEqual(['documents.write']);
    }
  });
});
