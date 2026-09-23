import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ExamOutcomeService } from './exam-outcome.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { MvpService } from '../mvp.service.js';

/**
 * Журнал расхождений 616: экран результата (`attempts/:id/result-view`) отдавал чужой результат
 * любому, у кого есть право читать результаты вообще, — проверка привязки слушателя была
 * объявлена в комментарии, но не вызывалась (`void access`). Теперь запись берётся через
 * обычное чтение `MvpService.getExamResult`, и отказ приходит оттуда.
 */

const T = 'tenant_demo';
const AT = { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' };

function makeService() {
  const state = new InMemoryMvpState();
  state.tests.push({
    id: 't1',
    tenantId: T,
    ...AT,
    title: 'Итоговый тест',
    status: 'active',
    rules: { passingScore: 7 }
  } as never);
  state.attempts.push({
    id: 'a1',
    tenantId: T,
    ...AT,
    testId: 't1',
    enrollmentId: 'e1',
    learnerId: 'l1',
    status: 'submitted',
    startedAt: AT.createdAt,
    submittedAt: AT.updatedAt,
    score: 9,
    maxScore: 10
  } as never);
  state.examResults.push({
    id: 'r1',
    tenantId: T,
    ...AT,
    testId: 't1',
    enrollmentId: 'e1',
    learnerId: 'l1',
    attemptsCount: 1,
    bestAttemptId: 'a1',
    bestScore: 9,
    finalScore: 9,
    maxScore: 10,
    passingScore: 7,
    passed: true,
    status: 'active'
  } as never);

  // Заглушка обычного чтения: свой (актор u_l1) и персонал с обходом видят, чужой — 403.
  const getExamResult = vi.fn(
    (tenantId: string, id: string, access?: { actorId?: string; permissions?: string[] }) => {
      const result = state.examResults.find((r) => r.tenantId === tenantId && r.id === id);
      if (!result) throw new NotFoundException({ code: 'not_found', message: 'Не найдено' });
      const bypass = access?.permissions?.includes('assessment.read.cross_learner');
      if (access?.actorId && !bypass && access.actorId !== 'u_l1') {
        throw new ForbiddenException({ code: 'forbidden', message: 'Чужой результат' });
      }
      return result;
    }
  );
  const mvp = { getExamResult } as unknown as MvpService;
  return { service: new ExamOutcomeService(state, mvp), getExamResult };
}

describe('ExamOutcomeService: экран результата уважает привязку слушателя (журнал 616)', () => {
  it('свой результат по попытке показывается, отбор идёт через обычное чтение результата', async () => {
    const { service, getExamResult } = makeService();
    const view = await service.viewForAttempt(T, 'a1', { actorId: 'u_l1', permissions: [] });
    expect(view.outcome).toBe('passed');
    expect(getExamResult).toHaveBeenCalledWith(T, 'r1', { actorId: 'u_l1', permissions: [] });
  });

  it('чужой результат по попытке — 403, а не экран с баллами', async () => {
    const { service } = makeService();
    await expect(
      service.viewForAttempt(T, 'a1', { actorId: 'u_stranger', permissions: [] })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('персонал с правом обхода видит результат любого слушателя', async () => {
    const { service } = makeService();
    const view = await service.viewForAttempt(T, 'a1', {
      actorId: 'u_staff',
      permissions: ['assessment.read.cross_learner']
    });
    expect(view.outcome).toBe('passed');
  });

  it('результата нет — 404 из обычного чтения, без утечки факта существования', async () => {
    const { service } = makeService();
    await expect(
      service.viewFor(T, 'r_missing', { actorId: 'u_stranger', permissions: [] })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
