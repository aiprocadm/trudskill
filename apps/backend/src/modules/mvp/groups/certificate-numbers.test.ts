import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { planCertificateNumbers } from './certificate-numbers.js';
import { IssueReadinessController } from './issue-readiness.controller.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { RealtimeEventsService } from '../../core/realtime-events.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { InMemoryDocumentsState } from '../../documents/in-memory-documents.state.js';
import { resolveDocumentVariables } from '../../documents/pillar-a-variables.js';
import { REQUIRED_PERMISSIONS } from '../../iam/permission.decorator.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';

const T = 'tenant_demo';
const ctx = { requestId: 'r', correlationId: 'c', tenantId: T, userId: 'u1' } as RequestContext;

describe('«Номера удостоверений»: правила (МГ-F3.2, срез 20.3a)', () => {
  const context = {
    enrollments: new Map([
      ['e1', { issued: false }],
      ['e2', { issued: false }],
      ['e3', { issued: true }]
    ]),
    takenNumbers: new Map([['264501-9', 'e_other']])
  };

  it('частичный успех: годные строки сохраняются, отказы — поимённо с причиной', () => {
    const { changes, outcome } = planCertificateNumbers(
      [
        { enrollmentId: 'e1', number: ' 264501-1 ', series: 'АБ', rank: '3' },
        { enrollmentId: 'e2', number: '264501-1' },
        { enrollmentId: 'e3', number: '264501-3' },
        { enrollmentId: 'e_x', number: '264501-4' },
        { enrollmentId: 'e2', number: '264501-9' }
      ],
      context
    );
    expect(changes).toEqual([{ enrollmentId: 'e1', number: '264501-1', series: 'АБ', rank: '3' }]);
    expect(outcome.rows.map((r) => r.code ?? r.status)).toEqual([
      'updated',
      'certificate_number_duplicate',
      'certificate_already_issued',
      'enrollment_not_in_group',
      'certificate_number_taken'
    ]);
    expect(outcome).toMatchObject({ total: 5, updated: 1, failed: 4 });
  });

  it('пустой номер снимает назначение', () => {
    const { changes } = planCertificateNumbers([{ enrollmentId: 'e1', number: '  ' }], context);
    expect(changes).toEqual([
      { enrollmentId: 'e1', number: undefined, series: undefined, rank: undefined }
    ]);
  });
});

describe('«Номера удостоверений»: сохранение и выпуск (МГ-F3.2, срез 20.3a)', () => {
  it('MvpService сохраняет номера, не трогает выпущенное и пишет журнал', () => {
    const state = new InMemoryMvpState();
    state.groups.push({ id: 'g1', tenantId: T, code: '264501', name: 'Группа' } as never);
    state.enrollments.push(
      { id: 'e1', tenantId: T, groupId: 'g1', learnerId: 'l1', status: 'active' } as never,
      {
        id: 'e2',
        tenantId: T,
        groupId: 'g1',
        learnerId: 'l2',
        status: 'completed',
        certificateNumber: 'OLD'
      } as never
    );
    const write = vi.fn();
    const documents = {
      listDocuments: (_t: string, q: { sourceEntityId?: string }) => ({
        items: q.sourceEntityId === 'e2' ? [{ status: 'final' }] : [],
        page: 1,
        pageSize: 50,
        total: 0
      })
    };
    const mvp = new MvpService(
      state,
      new TenantScopedRepository(),
      { write } as never,
      documents as never,
      {} as never,
      { emit: vi.fn() } as never
    );
    const outcome = mvp.assignCertificateNumbers(
      T,
      'u1',
      'g1',
      [
        { enrollmentId: 'e1', number: '264501-1', series: 'АБ' },
        { enrollmentId: 'e2', number: '264501-2' }
      ],
      ctx
    );
    expect(outcome).toMatchObject({ updated: 1, failed: 1 });
    expect(state.enrollments[0]).toMatchObject({
      certificateNumber: '264501-1',
      certificateSeries: 'АБ'
    });
    expect(state.enrollments[1]).toMatchObject({ certificateNumber: 'OLD' });
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.certificate_numbers_assigned' })
    );
  });

  it('выпуск берёт заранее назначенный номер, серию и разряд; счётчик не тратится; дубль вида — отказ', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const rule = service.createNumberingRule(T, {
      documentType: 'certificate',
      kindCode: 'certificate.ot',
      prefix: 'УД-',
      series: 'ЯЯ'
    });
    const reserved = service.reserveNumber(T, 'certificate', 'certificate.ot', {
      presetNumber: '264501-1',
      series: 'АБ',
      rank: '3'
    });
    expect(reserved).toMatchObject({ reservedNumber: '264501-1', series: 'АБ', rank: '3' });
    expect(service.getNumberingRule(T, rule.id).currentCounter).toBe(0);
    // Без заранее назначенного номера — счётчик и серия правила.
    expect(service.reserveNumber(T, 'certificate', 'certificate.ot')).toMatchObject({
      reservedNumber: 'УД-000001',
      series: 'ЯЯ'
    });
    expect(() =>
      service.reserveNumber(T, 'certificate', 'certificate.ot', { presetNumber: '264501-1' })
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_number_taken' })
      })
    );
  });

  it('бланк получает серию и разряд: {document.series}, {document.rank}', () => {
    const doc = {
      id: 'd1',
      documentNumber: '264501-1',
      series: 'АБ',
      rank: '3'
    } as GeneratedDocumentEntity;
    expect(
      resolveDocumentVariables({ document: doc, publicBaseUrl: undefined }, [
        'document.series',
        'document.rank'
      ])
    ).toEqual({ 'document.series': 'АБ', 'document.rank': '3' });
  });

  it('назначение номеров — под правом выпуска документов', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        IssueReadinessController.prototype.assignCertificateNumbers
      )
    ).toEqual(['documents.generate']);
  });
});
