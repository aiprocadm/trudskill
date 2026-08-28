import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { EffectiveIdentityPolicy } from './identity-policy.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';

/**
 * ФТ-C1, уровень 1 (ПЭП) — «Соглашение об электронном взаимодействии».
 *
 * ТЗ: на первом уровне слушатель подписывает соглашение, и с этого момента его клики
 * «Ознакомлен», ответы на тесты и заявления считаются подписанными простой электронной
 * подписью. Без соглашения подпись не возникает — значит и результат экзамена не имеет той
 * юридической силы, ради которой уровень вообще включают.
 *
 * До этого среза механизм был написан наполовину: `requiresSimpleSignature` существовала и
 * была покрыта тестом, но **не вызывалась ниоткуда** — в отличие от соседних уровней 2 и 3,
 * заведённых в гейты `startAttempt`. Уровень 1 можно было включить в настройках, и он ни на
 * что не влиял: центр считал, что собирает подписи, а не собирал ничего.
 */

const T = 'tenant_demo';
const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: 'u_admin',
  ip: '10.0.0.7',
  userAgent: 'vitest'
};

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  createUploadIntent: async () => ({ fileId: 'file_stub' })
} as unknown as FilesService;

const policy = (level: 0 | 1 | 2 | 3): EffectiveIdentityPolicy =>
  ({ level, scope: 'tenant' }) as unknown as EffectiveIdentityPolicy;

function harness() {
  const service = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );

  const course = service.createCourse(T, ctx.userId, { code: 'OT', title: 'Охрана труда' }, ctx);
  const group = service.createGroup(T, ctx.userId, { code: 'G1', name: 'Группа 1' }, ctx);
  service.createGroupCourse(T, { groupId: group.id, courseId: course.id });
  const learner = service.createLearnerExtended(
    T,
    ctx.userId,
    { firstName: 'Иван', lastName: 'Иванов' },
    ctx
  );
  const enrollment = service.createEnrollment(
    T,
    ctx.userId,
    { learnerId: learner.id, groupId: group.id },
    ctx
  );
  const test = service.createTest(
    T,
    ctx.userId,
    // Проходной балл живёт в `rules`, а не в корне запроса: пока тесты не проверялись
    // типами, поле в корне молча игнорировалось.
    { courseId: course.id, title: 'Итоговый тест', rules: { passingScore: 1 } },
    ctx
  );

  return { service, enrollment, test, learner };
}

describe('ФТ-C1 · уровень 1: без соглашения об электронном взаимодействии экзамен не начинается', () => {
  it('уровень 1 и соглашение не подписано → отказ с объяснением', () => {
    const { service, enrollment, test, learner } = harness();

    let thrown: unknown;
    try {
      service.startAttempt(
        T,
        ctx.userId,
        { enrollmentId: enrollment.id, testId: test.id, learnerId: learner.id },
        ctx,
        policy(1)
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown, 'экзамен начался без подписанного соглашения').toBeDefined();
    const response = (thrown as { response?: { code?: string; message?: string } }).response;
    expect(response?.code).toBe('electronic_agreement_required');
    // Сообщение объясняет человеку, что делать (TXT-004), а не называет код.
    expect(response?.message).toMatch(/[А-Яа-яЁё]/);
    expect(response?.message).toMatch(/соглашени/i);
  });

  it('соглашение подписано → экзамен начинается', () => {
    const { service, enrollment, test, learner } = harness();

    const attempt = service.startAttempt(
      T,
      ctx.userId,
      { enrollmentId: enrollment.id, testId: test.id, learnerId: learner.id },
      ctx,
      policy(1),
      { signedAt: '2026-08-01T10:00:00.000Z' }
    );

    expect(attempt.id).toBeTruthy();
  });

  it('уровень 0 — соглашение не требуется: уровень выключен, и гейт молчит', () => {
    const { service, enrollment, test, learner } = harness();

    const attempt = service.startAttempt(
      T,
      ctx.userId,
      { enrollmentId: enrollment.id, testId: test.id, learnerId: learner.id },
      ctx,
      policy(0)
    );

    expect(attempt.id).toBeTruthy();
  });

  it('на уровнях выше первого соглашение тоже обязательно — уровни накопительные', () => {
    const { service, enrollment, test, learner } = harness();

    expect(() =>
      service.startAttempt(
        T,
        ctx.userId,
        { enrollmentId: enrollment.id, testId: test.id, learnerId: learner.id },
        ctx,
        policy(3)
      )
    ).toThrowError(/соглашени/i);
  });
});
