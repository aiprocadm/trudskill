import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

const T = 'tenant_demo';
const ADMIN = 'u_tenant_admin';

const ctx: RequestContext = {
  requestId: 'req_grace',
  correlationId: 'corr_grace',
  tenantId: T,
  userId: ADMIN,
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const makeService = (): MvpService =>
  new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );

/** Курс → группа → слушатель → зачисление → банк → тест из одного вопроса → живая попытка. */
const seedAttempt = () => {
  const service = makeService();
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Курс' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Группа' }, ctx);
  service.createGroupCourse(T, { groupId: group.id, courseId: course.id });
  const learner = service.createLearner(T, ADMIN, { code: 'L1', name: 'Иванов Иван' }, ctx);
  const enrollment = service.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Банк', courseId: course.id }, ctx);
  const q = service.createQuestion(
    T,
    ADMIN,
    {
      questionBankId: bank.id,
      type: 'number_input',
      title: 'Сколько будет 2+2?',
      score: 2,
      numericExpected: 4,
      numericTolerance: 0.01
    } as never,
    ctx
  );
  const test = service.createTest(
    T,
    ADMIN,
    {
      title: 'Тест',
      courseId: course.id,
      questionBankId: bank.id,
      rules: { attemptLimit: 1, passingScore: 2 }
    },
    ctx
  );
  service.addTestQuestions(T, test.id, [q.id]);
  const attempt = service.startAttempt(
    T,
    ADMIN,
    { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
    ctx
  );
  return { service, q, test, attempt, enrollment };
};

/** Сдвигает срок попытки в прошлое на `ms` — имитация «время уже вышло». */
const expireBy = (service: MvpService, attemptId: string, ms: number): void => {
  const stored = (service as unknown as { state: InMemoryMvpState }).state.attempts.find(
    (a) => a.id === attemptId
  )!;
  stored.expiresAt = new Date(Date.now() - ms).toISOString();
};

/*
 * Ревизия 2026-08-27 (порция 25, журнал 275).
 *
 * Автосдача срабатывает, когда таймер дошёл до нуля, — то есть запрос физически уходит
 * на сервер ПОЗЖЕ момента истечения (тик таймера раз в секунду + латентность сети).
 * Сервер сравнивал сроки без всякого допуска, поэтому нормальная своевременная сдача
 * помечалась просроченной, ответы не оценивались, а попытка списывалась из лимита:
 * слушатель, использовавший ровно всё показанное ему время, ГАРАНТИРОВАННО получал ноль.
 *
 * Технологический допуск лечит именно это и НЕ ослабляет лимит времени: сдача, опоздавшая
 * заметно (десятки секунд), по-прежнему становится просроченной — см. сторож анти-чита
 * в `test-player.service.test.ts` (60 секунд) и границу допуска ниже.
 */
describe('своевременная сдача не пропадает: технологический допуск (порция 25)', () => {
  it('сдача через секунду после нуля оценивается как обычная', () => {
    const { service, q, attempt } = seedAttempt();
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '4' }, ctx);
    expireBy(service, attempt.id, 1_000);

    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);

    expect(submitted.status).toBe('submitted');
    expect(submitted.score).toBe(2);
    expect(submitted.passed).toBe(true);
  });

  it('последний ответ, улетевший вместе с автосдачей, ещё принимается', () => {
    const { service, q, attempt } = seedAttempt();
    expireBy(service, attempt.id, 1_000);

    // Плеер сначала досохраняет черновик текущего вопроса, и только потом сдаёт.
    const answer = service.saveAttemptAnswer(
      T,
      ADMIN,
      attempt.id,
      { questionId: q.id, textAnswer: '4' },
      ctx
    );
    expect(answer.textAnswer).toBe('4');

    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);
    expect(submitted.status).toBe('submitted');
    expect(submitted.passed).toBe(true);
  });

  it('результат экзамена засчитан: попытка не сгорает впустую', () => {
    const { service, q, attempt, test, enrollment } = seedAttempt();
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '4' }, ctx);
    expireBy(service, attempt.id, 1_000);
    service.submitAttempt(T, ADMIN, attempt.id, ctx);

    const result = service.getAttemptResult(T, attempt.id);
    expect(result.passed).toBe(true);
    expect(result.testId).toBe(test.id);
    expect(result.enrollmentId).toBe(enrollment.id);
  });

  it('опоздание за пределом допуска по-прежнему просрочено — лимит времени не ослаблен', () => {
    const { service, q, attempt } = seedAttempt();
    service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '4' }, ctx);
    expireBy(service, attempt.id, 30_000);

    const submitted = service.submitAttempt(T, ADMIN, attempt.id, ctx);
    expect(submitted.status).toBe('expired');
    expect(submitted.passed).toBeFalsy();
  });

  it('ответ, присланный далеко за сроком, не принимается', () => {
    const { service, q, attempt } = seedAttempt();
    expireBy(service, attempt.id, 30_000);

    expect(() =>
      service.saveAttemptAnswer(T, ADMIN, attempt.id, { questionId: q.id, textAnswer: '4' }, ctx)
    ).toThrow();
  });
});
