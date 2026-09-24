import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateNumberingRuleDto } from './documents.request-dto.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import {
  factTokensOf,
  formatParts,
  formatRuleNumber,
  isDerivedPattern,
  missingFacts
} from './numbering-format.js';
import { groupLearnerOrder, resolveGroupLearnersVariables } from './pillar-a-variables.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { DocumentGenerationTaskEntity, GeneratedDocumentEntity } from './documents.types.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { Enrollment, Learner } from '../mvp/mvp.types.js';

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

const protocolTask = (groupId: string): DocumentGenerationTaskEntity =>
  ({
    id: 'task_protocol',
    tenantId: T,
    templateId: 'tpl_protocol',
    documentType: 'protocol',
    sourceEntityType: 'group',
    sourceEntityId: groupId,
    groupId,
    status: 'queued',
    requestedAt: '2026-09-24T10:00:00.000Z'
  }) as unknown as DocumentGenerationTaskEntity;

describe('сборка номера по шаблону (МГ-F3.1, срез 19.2)', () => {
  it('токены CDOPROF подставляются, старые — как раньше', () => {
    const rule = { prefix: 'УД-', suffix: '/26', pattern: '{prefix}{counter}{suffix}' };
    expect(formatRuleNumber(rule, 7, '', {})).toBe('УД-000007/26');
    expect(
      formatRuleNumber(
        { prefix: '', suffix: '', pattern: '{protocol.number}-{seq.group}' },
        1,
        '',
        { protocolNumber: '264501', seqGroup: 3 }
      )
    ).toBe('264501-3');
    expect(
      formatRuleNumber(
        { prefix: '', suffix: '', pattern: '{series} № {seq.year}', series: 'АБ' },
        12,
        '',
        {}
      )
    ).toBe('АБ № 12');
  });

  it('три части номера: «растущая» часть прибавляет выданные номера, остальные стоят', () => {
    const parts = [
      { start: 2645, auto: false },
      { start: 1, auto: true },
      { start: 10, auto: true }
    ];
    expect(formatParts(parts, 1)).toBe('2645-1-10');
    expect(formatParts(parts, 3)).toBe('2645-3-12');
  });

  it('чего не хватает — названо по-человечески; номер только из данных группы счётчик не тратит', () => {
    expect(missingFacts('{group.code}', {})).toEqual(['код группы']);
    expect(missingFacts('{protocol.number}-{seq.group}', { protocolNumber: '1' })).toEqual([
      'порядок слушателя в группе'
    ]);
    expect(factTokensOf('{prefix}{counter}')).toEqual([]);
    expect(isDerivedPattern('{group.code}')).toBe(true);
    expect(isDerivedPattern('{group.code}/{counter}')).toBe(false);
  });
});

describe('выдача номера с данными группы (МГ-F3.1, срез 19.2)', () => {
  it('«номер приказа = код группы»: номер из кода, счётчик не двигается', () => {
    const { service } = make();
    const rule = service.createNumberingRule(T, {
      documentType: 'order',
      kindCode: 'order.enrollment',
      pattern: '{group.code}'
    });
    const reserved = service.reserveNumber(T, 'order', 'order.enrollment', {
      groupId: 'g1',
      groupCode: '264501'
    });
    expect(reserved.reservedNumber).toBe('264501');
    expect(service.getNumberingRule(T, rule.id).currentCounter).toBe(0);
  });

  it('нет кода группы — понятный отказ, а не номер с дыркой', () => {
    const { service } = make();
    service.createNumberingRule(T, {
      documentType: 'order',
      kindCode: 'order.enrollment',
      pattern: '{group.code}'
    });
    expect(() => service.reserveNumber(T, 'order', 'order.enrollment', {})).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'numbering_context_missing',
          message: expect.stringContaining('код группы')
        })
      })
    );
  });

  it('удостоверение = номер протокола + порядок: протокол без номера получает его первым', () => {
    const { state, service } = make();
    service.createNumberingRule(T, {
      documentType: 'protocol',
      kindCode: 'protocol.knowledge_check',
      pattern: '{group.code}'
    });
    service.createNumberingRule(T, {
      documentType: 'certificate',
      kindCode: 'certificate.ot',
      pattern: '{protocol.number}-{seq.group}'
    });
    const task = { ...protocolTask('g1'), kindCode: 'protocol.knowledge_check' };
    state.tasks.push(task);

    // Предпросмотр ничего не выдаёт: протокол ещё без номера — «не хватает номера протокола».
    const early = service.previewNumber(T, 'certificate', 'certificate.ot', {
      groupId: 'g1',
      groupCode: '264501'
    });
    expect(early).toMatchObject({ next: null, missing: ['номер протокола группы'] });
    expect(task.numberReservationId).toBeUndefined();

    const cert = service.reserveNumber(T, 'certificate', 'certificate.ot', {
      groupId: 'g1',
      groupCode: '264501',
      seqGroup: 3
    });
    expect(cert.reservedNumber).toBe('264501-3');
    const protocolReservation = state.reservations.find((r) => r.id === task.numberReservationId);
    expect(protocolReservation?.reservedNumber).toBe('264501');

    // Теперь протокол пронумерован — предпросмотр показывает номер первого слушателя.
    expect(
      service.previewNumber(T, 'certificate', 'certificate.ot', {
        groupId: 'g1',
        groupCode: '264501'
      })
    ).toMatchObject({ next: '264501-1', missing: [] });
  });

  it('предпросмотр совпадает со следующим выданным номером и не двигает счётчик', () => {
    const { service } = make();
    const rule = service.createNumberingRule(T, {
      documentType: 'order',
      pattern: '{parts}',
      parts: [
        { start: 2645, auto: false },
        { start: 1, auto: true }
      ]
    });
    const preview = service.previewNumber(T, 'order', undefined, {});
    expect(preview.next).toBe('2645-1');
    expect(service.getNumberingRule(T, rule.id).currentCounter).toBe(0);
    expect(service.reserveNumber(T, 'order').reservedNumber).toBe(preview.next);
    expect(service.previewNumber(T, 'order', undefined, {}).next).toBe('2645-2');
  });

  it('перевыпуск сохраняет вид документа (журнал 657)', async () => {
    const { state, service } = make();
    const original = {
      id: 'gdoc_1',
      tenantId: T,
      templateId: 'tpl',
      templateVersionId: 'tplv',
      documentType: 'order',
      kindCode: 'order.completion',
      name: 'order 1',
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      fileId: 'f',
      status: 'final',
      documentNumber: 'ORDER-000001',
      isFinal: true,
      generatedAt: '2026-09-24T10:00:00.000Z'
    } as unknown as GeneratedDocumentEntity;
    state.generatedDocuments.push(original);
    const { replacement } = await service.reissueDocument(T, ctx.userId, 'gdoc_1', 'опечатка', ctx);
    expect(replacement.kindCode).toBe('order.completion');
  });
});

describe('порядок слушателя в номере = строка протокола (МГ-F3.1)', () => {
  it('groupLearnerOrder совпадает с row_no таблицы протокола', () => {
    const learners = [
      { id: 'l1', tenantId: T, lastName: 'Яковлев', firstName: 'Иван' },
      { id: 'l2', tenantId: T, lastName: 'Абрамова', firstName: 'Анна' },
      { id: 'l3', tenantId: T, lastName: 'Миронов', firstName: 'Олег' },
      { id: 'l4', tenantId: T, lastName: 'Чужой', firstName: 'Пётр' }
    ] as unknown as Learner[];
    const enrollments = ['l1', 'l2', 'l3'].map((learnerId) => ({
      id: `e_${learnerId}`,
      learnerId,
      groupId: 'g1',
      status: 'active'
    })) as unknown as Enrollment[];
    const order = groupLearnerOrder({ learners, enrollments });
    expect(order).toEqual(['l2', 'l3', 'l1']);
    const rows = resolveGroupLearnersVariables({ learners, enrollments }, ['group_learners'])
      .group_learners as Array<{ row_no: number; full_name: string }>;
    expect(rows.map((r) => r.full_name)).toEqual(['Абрамова Анна', 'Миронов Олег', 'Яковлев Иван']);
  });
});

describe('части номера в запросе (МГ-F3.1)', () => {
  const errorsOf = (raw: unknown) =>
    validateSync(plainToInstance(CreateNumberingRuleDto, raw), {
      whitelist: true,
      forbidNonWhitelisted: true
    });

  it('до трёх частей с целым стартом и флажком', () => {
    expect(
      errorsOf({
        documentType: 'order',
        series: 'АБ',
        parts: [
          { start: 2645, auto: false },
          { start: 1, auto: true }
        ]
      })
    ).toHaveLength(0);
  });

  it('четыре части или дробный старт — отказ', () => {
    expect(
      errorsOf({
        documentType: 'order',
        parts: [1, 2, 3, 4].map((start) => ({ start, auto: true }))
      })
    ).not.toHaveLength(0);
    expect(
      errorsOf({ documentType: 'order', parts: [{ start: 1.5, auto: true }] })
    ).not.toHaveLength(0);
  });
});
