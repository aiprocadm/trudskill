import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { GeneratedDocumentEntity } from './documents.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_admin'
} as RequestContext;

const make = () => {
  const state = new InMemoryDocumentsState();
  const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
  return { state, service };
};

const issued = (
  state: InMemoryDocumentsState,
  documentNumber: string,
  reservationId: string,
  extra: Partial<GeneratedDocumentEntity> = {}
) => {
  const doc = {
    id: 'gdoc_1',
    tenantId: T,
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'order',
    kindCode: 'order.enrollment',
    name: 'order',
    sourceEntityType: 'group',
    sourceEntityId: 'g1',
    fileId: 'f',
    status: 'final',
    documentNumber,
    isFinal: true,
    generatedAt: '2026-09-30T10:00:00.000Z',
    ...extra
  } as GeneratedDocumentEntity;
  state.generatedDocuments.push(doc);
  const reservation = state.reservations.find((r) => r.id === reservationId);
  if (reservation) {
    reservation.status = 'used';
    reservation.documentId = doc.id;
  }
  return doc;
};

/**
 * РМ127 (ТЗ перехода с CDOPROF, Фаза 3, срез 21.4): перевыпуск документа с номером из данных
 * группы сохраняет номер, номер из счётчика — новый; серия и разряд переходят к замене.
 */
describe('перевыпуск и номер (РМ127, срез 21.4)', () => {
  it('«номер приказа = код группы»: замена получает тот же номер и резерв оригинала', async () => {
    const { state, service } = make();
    service.createNumberingRule(T, {
      documentType: 'order',
      kindCode: 'order.enrollment',
      pattern: '{group.code}'
    });
    const reservation = service.reserveNumber(T, 'order', 'order.enrollment', {
      groupId: 'g1',
      groupCode: '264501'
    });
    const original = issued(state, reservation.reservedNumber, reservation.id);
    const { replacement } = await service.reissueDocument(
      T,
      'u_admin',
      original.id,
      'опечатка в ФИО',
      ctx
    );
    expect(replacement.documentNumber).toBe('264501');
    expect(state.reservations.find((r) => r.id === reservation.id)?.documentId).toBe(
      replacement.id
    );
    expect(state.reservations).toHaveLength(1);
    expect(original.status).toBe('revoked');
  });

  it('номер из счётчика при перевыпуске — новый (как раньше); серия и разряд — у замены (журнал 665)', async () => {
    const { state, service } = make();
    service.createNumberingRule(T, { documentType: 'certificate', prefix: 'УД-' });
    const reservation = service.reserveNumber(T, 'certificate');
    const original = issued(state, reservation.reservedNumber, reservation.id, {
      documentType: 'certificate',
      kindCode: undefined,
      series: 'АБ',
      rank: '3'
    });
    const { replacement } = await service.reissueDocument(T, 'u_admin', original.id, 'утеря', ctx);
    expect(replacement.documentNumber).toBe('УД-000002');
    expect(replacement).toMatchObject({ series: 'АБ', rank: '3' });
  });
});
