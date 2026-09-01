import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { AssignmentReview } from './mvp.types.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

/**
 * Класс «поле запроса объявлено — кто его читает» (журнал 323, 324).
 *
 * Ручка принимает поле, проверяет его и отвечает 200 — а значение выбрасывает. Для человека
 * это худший вид отказа: он видит успех и уверен, что настройка применилась.
 */
const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_admin',
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

describe('пояснение к вопросу сохраняется при СОЗДАНИИ (журнал 323)', () => {
  it('методист написал пояснение — оно доехало до вопроса', () => {
    const mvp = makeService();
    const bank = mvp.createQuestionBank('tenant_demo', 'u_admin', { title: 'Банк' } as never, ctx);

    const question = mvp.createQuestion(
      'tenant_demo',
      'u_admin',
      {
        questionBankId: bank.id,
        type: 'single_choice',
        title: 'Сколько часов?',
        explanation: 'Правильный ответ — 16 часов: так требует программа Б.'
      } as never,
      ctx
    );

    expect(question.explanation).toBe('Правильный ответ — 16 часов: так требует программа Б.');
  });

  it('без пояснения поле не появляется — пустых значений не выдумываем', () => {
    const mvp = makeService();
    const bank = mvp.createQuestionBank('tenant_demo', 'u_admin', { title: 'Банк' } as never, ctx);

    const question = mvp.createQuestion(
      'tenant_demo',
      'u_admin',
      { questionBankId: bank.id, type: 'single_choice', title: 'Вопрос' } as never,
      ctx
    );

    expect(question.explanation).toBeUndefined();
  });
});

describe('статус проверки работы применяется, а не игнорируется (журнал 324)', () => {
  const seedReview = (mvp: MvpService, status: AssignmentReview['status']): AssignmentReview => {
    const review: AssignmentReview = {
      id: 'ar_1',
      tenantId: 'tenant_demo',
      assignmentId: 'asg_1',
      submissionId: 'sub_1',
      enrollmentId: 'enr_1',
      reviewerId: 'u_teacher',
      status,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z'
    } as AssignmentReview;
    (
      mvp as unknown as { state: { assignmentReviews: AssignmentReview[] } }
    ).state.assignmentReviews.push(review);
    return review;
  };

  it('работа из состояния «ждёт проверки» берётся в работу', () => {
    // В базе у колонки `review_status` значение по умолчанию — `pending` (миграция 0009).
    // Перевести такую проверку в работу было НЕЧЕМ: `/complete` требует `in_review`,
    // а PATCH статус молча выбрасывал. Проверка застревала навсегда.
    const mvp = makeService();
    seedReview(mvp, 'pending');

    const updated = mvp.updateAssignmentReview(
      'tenant_demo',
      'u_teacher',
      'ar_1',
      { reviewStatus: 'in_review' } as never,
      ctx
    );

    expect(updated.status).toBe('in_review');
  });

  it('повторная отправка того же статуса не ломается — так делает экран «Принять апелляцию»', () => {
    const mvp = makeService();
    seedReview(mvp, 'in_review');

    const updated = mvp.updateAssignmentReview(
      'tenant_demo',
      'u_teacher',
      'ar_1',
      { reviewStatus: 'in_review', comment: 'Слушатель подал апелляцию' } as never,
      ctx
    );

    expect(updated.status).toBe('in_review');
    expect(updated.comment).toBe('Слушатель подал апелляцию');
  });

  it('завершить проверку через общее изменение НЕЛЬЗЯ — иначе балл минует проверку', () => {
    // У `/complete` свои правила: проверка балла и своя запись в журнал. Разрешить
    // `completed` здесь значило бы обойти и то и другое.
    const mvp = makeService();
    seedReview(mvp, 'in_review');

    expect(() =>
      mvp.updateAssignmentReview(
        'tenant_demo',
        'u_teacher',
        'ar_1',
        { reviewStatus: 'completed' } as never,
        ctx
      )
    ).toThrow(/complete/i);
  });
});
