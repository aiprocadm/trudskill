import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { ENROLLMENT_COMPLETED_EVENT } from './enrollment-completed.event.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { InMemoryDocumentsState } from '../documents/in-memory-documents.state.js';

import type { EnrollmentCompletedPayload } from './enrollment-completed.event.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { FilesService } from '../files/files.service.js';

/**
 * Ключевой сценарий слушателя целиком (ТЗ «Стабилизация, UX и развитие», 16.5).
 *
 * **Что просит ТЗ дословно:** «Автотест полного пути: назначение курса → изучение материала →
 * отметка "изучено" → тест → результат → выдача документа. Это пункт 9 чек-листа, и он самый
 * ценный: именно он ломается чаще всего».
 *
 * **Чего не хватало.** Обе половины пути были покрыты — но ПО ОТДЕЛЬНОСТИ.
 * `business-flows.e2e` доводит слушателя до результата экзамена и там останавливается, а
 * проверка выдачи документа в том же файле выпускает бумагу для ВЫДУМАННОГО зачисления
 * (`sourceEntityId: 'enroll_stage13'`), не связанного ни с каким обучением. То есть обе
 * половины доказаны, а **шов между ними — нет**. Ломается же обычно шов (журнал 545).
 *
 * **Что проверяется на каждом шаге — результат для человека, а не факт вызова.** «Материал
 * изучен» — это `status: 'completed'`, а не «вызов прошёл»; «экзамен сдан» — `passed: true`;
 * «документ выдан» — слушатель ВИДИТ его в своих документах, а не «в базе появилась строка».
 *
 * **Чего этот тест НЕ делает.** Не поднимает слушателя выпуска документов
 * (`EnrollmentDocumentIssuanceListener`): он работает через `setImmediate`, очередь задач и
 * запуск в контексте центра, и в сервисном тесте это проверяло бы устройство очереди, а не
 * путь человека. Вместо этого проверяется, что **событие завершения уходит с нужным составом**
 * (именно по нему listener и выпускает документы), а сам документ выпускается для НАСТОЯЩЕГО
 * зачисления — так шов и оказывается проверен.
 */

const ctx: RequestContext = {
  requestId: 'req_learner_path',
  correlationId: 'corr_learner_path',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const noopFiles = { ensureMaterialLink: async () => undefined } as unknown as FilesService;

/** Учётная запись слушателя — от её имени он смотрит свои документы. */
const LEARNER_ACCOUNT = 'u_learner_path';

describe('ключевой сценарий слушателя целиком (ТЗ 16.5)', () => {
  it('назначение курса → изучение → отметка → экзамен → результат → документ на руках', () => {
    const state = new InMemoryMvpState();
    const audit = new AuditService();
    const events = new EventEmitter2();
    const documents = new DocumentsService(
      new InMemoryDocumentsState(),
      audit,
      new RealtimeEventsService()
    );
    const service = new MvpService(
      state,
      new TenantScopedRepository(),
      audit,
      documents,
      noopFiles,
      events
    );

    const completed: EnrollmentCompletedPayload[] = [];
    events.on(ENROLLMENT_COMPLETED_EVENT, (payload: EnrollmentCompletedPayload) => {
      completed.push(payload);
    });

    // ── Шаг 1. Методист собирает программу и публикует её ──────────────────────────────
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C-PATH', title: 'Охрана труда для руководителей' },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const courseModule = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'Основы', minViewSeconds: 0 },
      ctx
    );
    const material = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      {
        moduleId: courseModule.id,
        title: 'Вводный урок',
        materialType: 'text',
        minViewSeconds: 60,
        isRequired: true
      },
      ctx
    );
    service.publishCourse('tenant_demo', ctx.userId, course.id, ctx);
    expect(
      service.getCourse('tenant_demo', course.id).status,
      'неопубликованный курс слушателю не назначают'
    ).toBe('published');

    // ── Шаг 2. Администратор назначает курс: группа, слушатель, зачисление ─────────────
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G-PATH', name: 'Группа сентября' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearnerExtended(
      'tenant_demo',
      ctx.userId,
      { firstName: 'Пётр', lastName: 'Иванов' },
      ctx
    );
    /* Учётная запись слушателя привязывается тем же способом, что и в жизни, — правкой карточки. */
    service.updateLearner(
      'tenant_demo',
      ctx.userId,
      learner.id,
      { linkedIamUserId: LEARNER_ACCOUNT },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    // ── Шаг 3. Слушатель изучает материал и ставит отметку ─────────────────────────────
    const started = service.upsertMaterialProgress(
      'tenant_demo',
      LEARNER_ACCOUNT,
      material.id,
      { enrollmentId: enrollment.id, studiedSeconds: 30 },
      ctx
    );
    expect(started.status, 'полминуты из минуты — материал ещё не изучен').not.toBe('completed');

    const studied = service.upsertMaterialProgress(
      'tenant_demo',
      LEARNER_ACCOUNT,
      material.id,
      { enrollmentId: enrollment.id, studiedSeconds: 60 },
      ctx
    );
    expect(studied.status, 'минимум просмотра отсижен — материал изучен').toBe('completed');

    // ── Шаг 4. Экзамен ────────────────────────────────────────────────────────────────
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'Банк вопросов курса', courseId: course.id },
      ctx
    );
    const question = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        text: 'Кто отвечает за охрану труда в организации?',
        type: 'single_choice',
        options: [
          { text: 'Работодатель', isCorrect: true },
          { text: 'Работник', isCorrect: false }
        ]
      },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'Итоговая проверка знаний',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore: 1 }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [question.id]);

    const attempt = service.startAttempt(
      'tenant_demo',
      LEARNER_ACCOUNT,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    const correct = state.answerOptions.find(
      (item) => item.questionId === question.id && item.isCorrect
    );
    expect(correct, 'верный ответ должен существовать — иначе экзамен сдать нельзя').toBeDefined();

    service.saveAttemptAnswer(
      'tenant_demo',
      LEARNER_ACCOUNT,
      attempt.id,
      { questionId: question.id, answerOptionIds: [correct!.id] },
      ctx
    );
    service.submitAttempt('tenant_demo', LEARNER_ACCOUNT, attempt.id, ctx);
    service.finishAttempt('tenant_demo', LEARNER_ACCOUNT, attempt.id, ctx);

    // ── Шаг 5. Результат ──────────────────────────────────────────────────────────────
    const result = service.getAttemptResult('tenant_demo', attempt.id);
    expect(result.passed, 'верный ответ при пороге в один балл — экзамен сдан').toBe(true);

    // ── Шаг 6. Завершение обучения: уходит событие, по которому выпускаются документы ──
    /*
     * Путь идёт через «идёт обучение», а не сразу в «завершено»: машина состояний зачисления
     * разрешает `pending → active → completed`, и прыжок через ступень она отклоняет. Это не
     * придирка теста, а домен: нельзя завершить то, что не начиналось.
     */
    expect(
      () =>
        service.changeEnrollmentStatus(
          'tenant_demo',
          ctx.userId,
          enrollment.id,
          { status: 'completed' },
          ctx
        ),
      'завершить необновлённое зачисление нельзя'
    ).toThrow(/«ожидает» → «завершил»/);

    service.changeEnrollmentStatus(
      'tenant_demo',
      ctx.userId,
      enrollment.id,
      { status: 'active' },
      ctx
    );
    expect(completed, 'начало обучения — ещё не повод выпускать документы').toEqual([]);

    service.changeEnrollmentStatus(
      'tenant_demo',
      ctx.userId,
      enrollment.id,
      { status: 'completed' },
      ctx
    );

    expect(completed, 'без события документы не выпустятся вообще').toHaveLength(1);
    expect(completed[0]?.enrollmentId, 'событие про ЭТО зачисление').toBe(enrollment.id);
    expect(completed[0]?.tenantId).toBe('tenant_demo');

    // ── Шаг 7. Документ выдан — и слушатель его видит ─────────────────────────────────
    const template = documents.createTemplate(
      'tenant_demo',
      ctx.userId,
      { name: 'Удостоверение', templateType: 'certificate' },
      ctx
    );
    const templateVersion = documents.createTemplateVersion('tenant_demo', ctx.userId, {
      templateId: template.id,
      fileId: 'file_template_path'
    });
    documents.activateTemplateVersion('tenant_demo', ctx.userId, templateVersion.id, ctx);

    const task = documents.generateDocument('tenant_demo', ctx.userId, {
      idempotencyKey: `learner-path-${enrollment.id}`,
      templateId: template.id,
      templateVersionId: templateVersion.id,
      sourceEntityType: 'enrollment',
      /* Настоящее зачисление, а не выдуманное, — ровно здесь и проходит шов (журнал 545). */
      sourceEntityId: enrollment.id,
      documentType: 'certificate'
    });
    const issued = documents.completeTask(
      'tenant_demo',
      task.id,
      'file_certificate_path',
      ctx.userId
    );
    expect(issued.sourceEntityId, 'документ привязан к обучению этого человека').toBe(
      enrollment.id
    );

    const mine = service.listMyDocuments('tenant_demo', LEARNER_ACCOUNT);
    expect(mine.items, 'документ, которого человек не видит, для него не существует').toHaveLength(
      1
    );
    expect(mine.items[0]?.id).toBe(issued.id);
  });

  it('незавершённое обучение документа не даёт и события не шлёт', () => {
    /*
     * Обратная сторона того же пути. Без неё проверка выше доказывала бы только, что «если всё
     * сделать, всё получится», — но не что продукт не выдаёт документы кому попало.
     */
    const state = new InMemoryMvpState();
    const audit = new AuditService();
    const events = new EventEmitter2();
    const documents = new DocumentsService(
      new InMemoryDocumentsState(),
      audit,
      new RealtimeEventsService()
    );
    const service = new MvpService(
      state,
      new TenantScopedRepository(),
      audit,
      documents,
      noopFiles,
      events
    );

    const completed: EnrollmentCompletedPayload[] = [];
    events.on(ENROLLMENT_COMPLETED_EVENT, (payload: EnrollmentCompletedPayload) => {
      completed.push(payload);
    });

    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C-PATH-2', title: 'Курс' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G-PATH-2', name: 'Группа' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearnerExtended(
      'tenant_demo',
      ctx.userId,
      { firstName: 'Анна', lastName: 'Петрова' },
      ctx
    );
    service.updateLearner(
      'tenant_demo',
      ctx.userId,
      learner.id,
      { linkedIamUserId: LEARNER_ACCOUNT },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    service.changeEnrollmentStatus(
      'tenant_demo',
      ctx.userId,
      enrollment.id,
      { status: 'active' },
      ctx
    );
    service.changeEnrollmentStatus(
      'tenant_demo',
      ctx.userId,
      enrollment.id,
      { status: 'suspended' },
      ctx
    );

    expect(completed, 'приостановка — не завершение; документы выпускать не с чего').toEqual([]);
    expect(service.listMyDocuments('tenant_demo', LEARNER_ACCOUNT).items).toEqual([]);
  });
});
