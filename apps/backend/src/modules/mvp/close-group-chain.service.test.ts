import { PreconditionFailedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CloseGroupChainService } from './close-group-chain.service.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';

import type { ExamReadinessReport } from './exam-readiness.js';
import type { MvpService } from './mvp.service.js';
import type { OtRegistryService } from './ot-registry/ot-registry.service.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { DocumentsService } from '../documents/documents.service.js';

/**
 * ФТ-E3 (Фаза 5 Task 7): оркестровка цепочки. Шаги застаблены — их поведение
 * проверяют собственные тесты (closeGroup — в documents, выгрузка — в ot-registry);
 * здесь проверяется склейка: порядок, частичный успех, идемпотентность, отказ
 * на проблемах уровня группы.
 */

const T = 'tenant_demo';
const ctx = { tenantId: T, requestId: 'r1', correlationId: 'c1' } as RequestContext;

const REQUEST = {
  groupId: 'g1',
  courseId: 'c1',
  protocolTemplateId: 'tpl_protocol',
  certificateTemplateId: 'tpl_cert',
  idempotencyKey: 'key-1'
};

const base = {
  tenantId: T,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
};

function harness(readiness: ExamReadinessReport = { ready: true, issues: [] }) {
  const state = new InMemoryMvpState();
  state.learners.push(
    { ...base, id: 'l1', status: 'active', firstName: 'Иван', lastName: 'Сдавший' } as never,
    { ...base, id: 'l2', status: 'active', firstName: 'Пётр', lastName: 'Несдавший' } as never
  );
  state.enrollments.push(
    { ...base, id: 'e1', groupId: 'g1', learnerId: 'l1', status: 'completed' } as never,
    { ...base, id: 'e2', groupId: 'g1', learnerId: 'l2', status: 'completed' } as never,
    // Чужая группа — цепочка её не трогает.
    { ...base, id: 'e_other', groupId: 'g_other', learnerId: 'l1', status: 'completed' } as never
  );
  state.examResults.push(
    { ...base, id: 'er1', enrollmentId: 'e1', learnerId: 'l1', passed: true } as never,
    { ...base, id: 'er2', enrollmentId: 'e2', learnerId: 'l2', passed: false } as never
  );

  const closeGroup = vi.fn().mockReturnValue({
    protocol: { id: 'task_protocol' },
    certificates: [{ id: 'task_cert_1' }],
    created: 2,
    retried: 0
  });
  const exportOtRegistry = vi.fn().mockResolvedValue({
    batchId: 'batch_1',
    total: 1,
    exported: 1,
    failed: 0,
    rows: [],
    errors: [],
    readiness: { ready: true, blockers: [] }
  });
  const audit = { write: vi.fn() };

  const service = new CloseGroupChainService(
    state,
    { getExamReadiness: vi.fn().mockReturnValue(readiness) } as unknown as MvpService,
    { closeGroup } as unknown as DocumentsService,
    { exportOtRegistry } as unknown as OtRegistryService,
    audit as unknown as AuditService
  );
  return { service, state, closeGroup, exportOtRegistry, audit };
}

describe('цепочка «экзамен → протокол → документы → реестр» (ФТ-E3)', () => {
  it('сдавшие доходят до документов и выгрузки; несдавший — в отчёте, а не в отказе', async () => {
    const h = harness();
    const outcome = await h.service.runChain(T, 'u_admin', REQUEST, ctx);

    expect(outcome.eligible).toBe(1);
    expect(outcome.skipped.map((s) => [s.enrollmentId, s.code])).toEqual([
      ['e2', 'exam_not_passed']
    ]);
    expect(h.closeGroup).toHaveBeenCalledWith(
      T,
      'u_admin',
      expect.objectContaining({ groupId: 'g1', enrollmentIds: ['e1'] }),
      ctx
    );
    expect(h.exportOtRegistry).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ groupId: 'g1' }),
      ctx
    );
    expect(outcome.documents?.protocolTaskId).toBe('task_protocol');
    expect(outcome.registry?.batchId).toBe('batch_1');
    expect(outcome.cached).toBe(false);
  });

  it('проблема уровня группы (комиссия) валит цепочку целиком: протокол один на всех', async () => {
    const h = harness({
      ready: false,
      issues: [{ scope: 'commission', code: 'commission_too_small', message: 'В комиссии 2 чел.' }]
    });
    await expect(h.service.runChain(T, 'u_admin', REQUEST, ctx)).rejects.toThrow(
      PreconditionFailedException
    );
    expect(h.closeGroup).not.toHaveBeenCalled();
    expect(h.exportOtRegistry).not.toHaveBeenCalled();
  });

  it('проблема слушателя (СНИЛС) отсеивает только его — цепочка идёт дальше', async () => {
    const h = harness({
      ready: false,
      issues: [
        {
          scope: 'learner',
          subjectId: 'l1',
          subjectName: 'Сдавший Иван',
          code: 'learner_snils_missing',
          message: 'Не заполнен СНИЛС'
        }
      ]
    });
    const outcome = await h.service.runChain(T, 'u_admin', REQUEST, ctx);
    // l1 отсеян по СНИЛС, l2 — по экзамену: довести некого, но это ОТЧЁТ, не ошибка.
    expect(outcome.eligible).toBe(0);
    expect(outcome.skipped.map((s) => s.code).sort()).toEqual(['exam_not_passed', 'learner_issue']);
    expect(outcome.documents).toBeNull();
    expect(outcome.registry).toBeNull();
    expect(h.closeGroup).not.toHaveBeenCalled();
    expect(h.exportOtRegistry).not.toHaveBeenCalled();
  });

  it('идемпотентность: повтор с тем же ключом возвращает прежний отчёт и не создаёт вторую выгрузку', async () => {
    const h = harness();
    const first = await h.service.runChain(T, 'u_admin', REQUEST, ctx);
    const second = await h.service.runChain(T, 'u_admin', REQUEST, ctx);

    expect(h.closeGroup).toHaveBeenCalledTimes(1);
    expect(h.exportOtRegistry).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
    expect(second.registry?.batchId).toBe(first.registry?.batchId);
  });

  it('другой ключ — новая выгрузка, но документы защищены детерминированными ключами шага', async () => {
    const h = harness();
    await h.service.runChain(T, 'u_admin', REQUEST, ctx);
    await h.service.runChain(T, 'u_admin', { ...REQUEST, idempotencyKey: 'key-2' }, ctx);
    // Оба вызова прошли до шагов: дедупликацию документов обеспечивает сам
    // DocumentsService.closeGroup (ключи close-group:<group>:…), это его тесты.
    expect(h.closeGroup).toHaveBeenCalledTimes(2);
    expect(h.exportOtRegistry).toHaveBeenCalledTimes(2);
  });

  it('исход записывается в аудит с числами по шагам', async () => {
    const h = harness();
    await h.service.runChain(T, 'u_admin', REQUEST, ctx);
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'learning.group_close_chain',
        entityId: 'g1',
        metadata: expect.objectContaining({ eligible: 1, skipped: 1, registryBatchId: 'batch_1' })
      })
    );
  });
});
