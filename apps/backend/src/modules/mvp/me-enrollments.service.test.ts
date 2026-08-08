import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

/**
 * Фаза 6 Task 1, дефект D — кабинет слушателя и отбор зачислений.
 *
 * Две связанные вещи проверяются вместе, потому что чинить их порознь нельзя:
 * 1) `/me/enrollments` — кабинет не знает идентификатор КАРТОЧКИ слушателя
 *    (`learner_*`) и спрашивал зачисления по идентификатору IAM-пользователя;
 * 2) отбор `restrictLearnerIdsForAssessmentList` раньше трактовал «нет привязки»
 *    как «ограничений нет», то есть отдавал зачисления всего центра.
 */

const T = 'tenant_demo';

const ctx = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  createUploadIntent: async () => ({ fileId: 'file_stub' })
} as unknown as FilesService;

function harness() {
  const state = new InMemoryMvpState();
  const service = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );

  const course = service.createCourse(T, ctx.userId, { code: 'OT', title: 'Охрана труда' }, ctx);
  const group = service.createGroup(T, ctx.userId, { code: 'G1', name: 'Группа 1' }, ctx);
  service.createGroupCourse(T, { groupId: group.id, courseId: course.id });

  // Слушатель с привязкой к IAM-пользователю: именно он открывает кабинет.
  const mine = service.createLearner(
    T,
    ctx.userId,
    { code: 'L_MINE', name: 'Иванов Иван', linkedIamUserId: 'u_learner' },
    ctx
  );
  const other = service.createLearner(
    T,
    ctx.userId,
    { code: 'L_OTHER', name: 'Петров Пётр', linkedIamUserId: 'u_other' },
    ctx
  );

  const enrMine = service.createEnrollment(
    T,
    ctx.userId,
    { groupId: group.id, learnerId: mine.id },
    ctx
  );
  const enrOther = service.createEnrollment(
    T,
    ctx.userId,
    { groupId: group.id, learnerId: other.id },
    ctx
  );

  return { service, state, course, group, mine, other, enrMine, enrOther };
}

describe('GET /me/enrollments — зачисления текущего IAM-актора', () => {
  it('отдаёт зачисления привязанной карточки вместе с courseId группы', () => {
    const h = harness();
    const result = h.service.listMyEnrollments(T, 'u_learner');
    expect(result.items.map((item) => item.id)).toEqual([h.enrMine.id]);
    // Курс обязан прийти из ручки: у зачисления своего courseId нет, он на группе.
    expect(result.items[0]?.courseId).toBe(h.course.id);
    expect(result.items[0]?.courseTitle).toBe('Охрана труда');
    expect(result.items[0]?.learnerId).toBe(h.mine.id);
  });

  it('не отдаёт чужие зачисления того же центра', () => {
    const h = harness();
    const result = h.service.listMyEnrollments(T, 'u_learner');
    expect(result.items.some((item) => item.id === h.enrOther.id)).toBe(false);
  });

  it('непривязанному актору возвращает пустой список, а не бросает 403', () => {
    const h = harness();
    expect(h.service.listMyEnrollments(T, 'u_manager').items).toEqual([]);
  });

  it('без актора (внутренний вызов) возвращает пустой список', () => {
    const h = harness();
    expect(h.service.listMyEnrollments(T, undefined).items).toEqual([]);
  });

  it('не показывает зачисления соседнего тенанта', () => {
    const h = harness();
    // Карточка с тем же linkedIamUserId в другом тенанте не должна расширять выдачу.
    h.state.learners.push({
      ...h.mine,
      id: 'learner_foreign',
      tenantId: 'tenant_other'
    });
    h.state.enrollments.push({
      ...h.enrMine,
      id: 'enr_foreign',
      tenantId: 'tenant_other',
      learnerId: 'learner_foreign'
    });
    const result = h.service.listMyEnrollments(T, 'u_learner');
    expect(result.items.map((item) => item.id)).toEqual([h.enrMine.id]);
  });
});

describe('отбор списков fail-closed (дефект D, часть 2)', () => {
  it('актор без привязки и без bypass-права не видит НИЧЕГО, а не весь центр', () => {
    const h = harness();
    const listed = h.service.listEnrollments(
      T,
      { page: 1, page_size: 50 },
      { actorId: 'u_nobody', permissions: ['enrollments.read'] }
    );
    expect(listed.items).toEqual([]);
    expect(listed.total).toBe(0);
  });

  it('персонал с assessment.read.cross_learner по-прежнему видит весь центр', () => {
    const h = harness();
    const listed = h.service.listEnrollments(
      T,
      { page: 1, page_size: 50 },
      { actorId: 'u_manager', permissions: ['enrollments.read', 'assessment.read.cross_learner'] }
    );
    expect(listed.items.map((item) => item.id).sort()).toEqual(
      [h.enrMine.id, h.enrOther.id].sort()
    );
  });

  it('персонал с learners.act_as по-прежнему видит весь центр', () => {
    const h = harness();
    const listed = h.service.listEnrollments(
      T,
      { page: 1, page_size: 50 },
      { actorId: 'u_manager', permissions: ['enrollments.read', 'learners.act_as'] }
    );
    expect(listed.total).toBe(2);
  });

  it('внутренний вызов без актора остаётся неограниченным (реестры и выгрузки)', () => {
    const h = harness();
    expect(h.service.listEnrollments(T, { page: 1, page_size: 50 }).total).toBe(2);
  });

  it('привязанный слушатель видит только свои зачисления', () => {
    const h = harness();
    const listed = h.service.listEnrollments(
      T,
      { page: 1, page_size: 50 },
      { actorId: 'u_learner', permissions: ['enrollments.read'] }
    );
    expect(listed.items.map((item) => item.id)).toEqual([h.enrMine.id]);
  });

  it('прогресс тоже закрыт: непривязанный актор без bypass не видит чужих строк', () => {
    const h = harness();
    h.state.courseProgress.push({
      id: 'cp_1',
      tenantId: T,
      enrollmentId: h.enrMine.id,
      courseId: h.course.id,
      moduleId: 'm1',
      materialId: 'mat1',
      status: 'in_progress',
      studiedSeconds: 10,
      requiredSeconds: 60,
      progressPercent: 15,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z'
    } as never);
    const listed = h.service.listProgress(
      T,
      { page: 1, page_size: 50 },
      { actorId: 'u_nobody', permissions: ['progress.read'] }
    );
    expect(listed.items).toEqual([]);
  });
});
