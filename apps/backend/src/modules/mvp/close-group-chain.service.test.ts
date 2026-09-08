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

/**
 * Массовое закрытие групп (вопрос №13 «Арендной СДО», решение 08.09.2026).
 *
 * Главное, что здесь проверяется, — что пачка НЕ отменяется целиком. Закрытие групп делают
 * в конце месяца десятками; «не прошло из-за одной группы без комиссии» означало бы работу
 * заново для всех остальных.
 */
describe('массовое закрытие групп — частичный успех', () => {
  const BULK = {
    protocolTemplateId: 'tpl_protocol',
    certificateTemplateId: 'tpl_cert',
    idempotencyKey: 'bulk-1'
  };

  /** Готовит состояние: группы с названиями и назначенными курсами. */
  const withGroups = (h: ReturnType<typeof harness>) => {
    h.state.groups.push(
      { ...base, id: 'g1', status: 'active', code: 'ОТ-01', name: 'ОТ-01 Охрана труда' } as never,
      {
        ...base,
        id: 'g2',
        status: 'active',
        code: 'ОТ-02',
        name: 'ОТ-02 Электробезопасность'
      } as never,
      { ...base, id: 'g3', status: 'active', code: 'ОТ-03', name: 'ОТ-03 Без курса' } as never,
      { ...base, id: 'g4', status: 'active', code: 'ОТ-04', name: 'ОТ-04 Два курса' } as never
    );
    h.state.groupCourses.push(
      { ...base, id: 'gc1', groupId: 'g1', courseId: 'c1', sortOrder: 1 } as never,
      { ...base, id: 'gc2', groupId: 'g2', courseId: 'c2', sortOrder: 1 } as never,
      { ...base, id: 'gc4a', groupId: 'g4', courseId: 'c1', sortOrder: 1 } as never,
      { ...base, id: 'gc4b', groupId: 'g4', courseId: 'c2', sortOrder: 2 } as never
    );
    return h;
  };

  it('группа без курса и группа с двумя курсами пропускаются с объяснением, остальные закрываются', async () => {
    const h = withGroups(harness());
    const outcome = await h.service.runChainBulk(
      T,
      'u_admin',
      { ...BULK, groupIds: ['g1', 'g3', 'g4'] },
      ctx
    );

    expect(outcome.total).toBe(3);
    expect(outcome.closed).toBe(1);
    expect(outcome.skipped).toBe(2);
    /* Отчёт читает человек: названия групп, а не идентификаторы, и причина словами. */
    expect(outcome.rows.map((r) => [r.groupName, r.status, r.reason])).toEqual([
      ['ОТ-01 Охрана труда', 'closed', undefined],
      ['ОТ-03 Без курса', 'skipped', 'Группе не назначен курс — назначьте программу и повторите'],
      [
        'ОТ-04 Два курса',
        'skipped',
        'В группе несколько курсов — закройте её отдельно, чтобы выбрать нужный'
      ]
    ]);
  });

  it('неготовая группа не отменяет остальные, а причина берётся из проверок', async () => {
    const h = withGroups(harness());
    /* Первая группа не готова (нет комиссии), вторая готова. */
    const readiness = h.service as unknown as {
      mvp: { getExamReadiness: ReturnType<typeof vi.fn> };
    };
    readiness.mvp.getExamReadiness = vi
      .fn()
      .mockReturnValueOnce({
        ready: false,
        issues: [
          {
            scope: 'program',
            code: 'commission_not_assigned',
            message: 'Программе не назначена аттестационная комиссия'
          }
        ]
      })
      .mockReturnValue({ ready: true, issues: [] });

    const outcome = await h.service.runChainBulk(
      T,
      'u_admin',
      { ...BULK, groupIds: ['g1', 'g2'] },
      ctx
    );

    expect(outcome.closed).toBe(1);
    expect(outcome.rows[0]).toMatchObject({
      groupName: 'ОТ-01 Охрана труда',
      status: 'skipped',
      reason: 'Программе не назначена аттестационная комиссия'
    });
    expect(outcome.rows[1]).toMatchObject({
      groupName: 'ОТ-02 Электробезопасность',
      status: 'closed'
    });
  });

  it('чужая группа не закрывается: её просто нет в этом центре', async () => {
    const h = withGroups(harness());
    const outcome = await h.service.runChainBulk(
      T,
      'u_admin',
      { ...BULK, groupIds: ['g_from_other_tenant'] },
      ctx
    );
    expect(outcome.rows[0]).toMatchObject({
      status: 'skipped',
      reason: 'Группы нет в этом учебном центре'
    });
    expect(h.closeGroup).not.toHaveBeenCalled();
  });

  it('дубли в выделении закрывают группу один раз', async () => {
    const h = withGroups(harness());
    const outcome = await h.service.runChainBulk(
      T,
      'u_admin',
      { ...BULK, groupIds: ['g1', 'g1', ' g1 '] },
      ctx
    );
    expect(outcome.total).toBe(1);
    expect(h.closeGroup).toHaveBeenCalledTimes(1);
  });

  it('ключ каждой группы выводится из общего — повтор пачки не выпускает второй комплект', async () => {
    const h = withGroups(harness());
    await h.service.runChainBulk(T, 'u_admin', { ...BULK, groupIds: ['g1', 'g2'] }, ctx);
    const first = h.closeGroup.mock.calls.length;
    const again = await h.service.runChainBulk(
      T,
      'u_admin',
      { ...BULK, groupIds: ['g1', 'g2'] },
      ctx
    );

    /* Повтор отвечает тем же отчётом и НЕ идёт в выпуск документов заново. */
    expect(again.closed).toBe(2);
    expect(h.closeGroup.mock.calls.length).toBe(first);
  });

  it('отсеянные внутри группы попадают в отчёт поимённо', async () => {
    const h = withGroups(harness());
    const outcome = await h.service.runChainBulk(T, 'u_admin', { ...BULK, groupIds: ['g1'] }, ctx);
    expect(outcome.rows[0]?.skippedLearners).toEqual([
      { fullName: 'Несдавший Пётр', message: expect.any(String) }
    ]);
  });
});
