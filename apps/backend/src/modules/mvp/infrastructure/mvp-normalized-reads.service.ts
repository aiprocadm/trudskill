import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { decryptLearnerPiiAtRest } from '../../../infrastructure/crypto/pii-crypto.js';
import { resolveCounterpartyScope, scopeAllows } from '../counterparty-scope.js';
import { COUNTERPARTIES_REPOSITORY } from './repositories/counterparties.repository.js';
import { ENROLLMENTS_REPOSITORY } from './repositories/enrollments.repository.js';
import { EXAM_RESULTS_REPOSITORY } from './repositories/exam-results.repository.js';
import { GROUP_COURSES_REPOSITORY } from './repositories/group-courses.repository.js';
import { GROUPS_REPOSITORY } from './repositories/groups.repository.js';
import { LEARNERS_REPOSITORY } from './repositories/learners.repository.js';
import { COUNTERPARTY_SORT_COLUMNS } from './repositories/postgres-counterparties.repository.js';
import { parseEnrollmentListQuery } from './repositories/postgres-enrollments.repository.js';
import { parseExamResultListQuery } from './repositories/postgres-exam-results.repository.js';
import { parseGroupCourseListQuery } from './repositories/postgres-group-courses.repository.js';
import { GROUP_SORT_COLUMNS } from './repositories/postgres-groups.repository.js';
import { LEARNER_SORT_COLUMNS } from './repositories/postgres-learners.repository.js';
import { parseRegistryListQuery } from './repositories/registry-list-query.js';

import type { BaseFilterQuery } from '../mvp.dto.js';
import type {
  Counterparty,
  Enrollment,
  EnrollmentStatusHistory,
  ExamResult,
  GroupCourse,
  GroupEntity,
  Learner
} from '../mvp.types.js';
import type { CounterpartiesRepository } from './repositories/counterparties.repository.js';
import type { EnrollmentsRepository } from './repositories/enrollments.repository.js';
import type { ExamResultsRepository } from './repositories/exam-results.repository.js';
import type { GroupCoursesRepository } from './repositories/group-courses.repository.js';
import type { GroupsRepository } from './repositories/groups.repository.js';
import type { LearnersRepository } from './repositories/learners.repository.js';
import type { LookupItem, RegistryListPage } from './repositories/registry-list-query.js';

/** Права обхода anti-IDOR — те же строки, что в `MvpService` (там константы не экспортируются). */
const ASSESSMENT_READ_CROSS_LEARNER_PERMISSION = 'assessment.read.cross_learner';
const LEARNERS_ACT_AS_PERMISSION = 'learners.act_as';

/** Кто спрашивает зачисления — как `MvpAssessmentReadAccess` в `MvpService`. */
export interface NormalizedReadAccess {
  actorId?: string;
  permissions?: readonly string[];
  actor?: { counterpartyId?: string };
}

/**
 * Чтение контрагентов и групп из нормализованных таблиц (Фаза 1, срез 1b) — зеркало методов
 * `MvpService` (`listGroups`, `getGroup`, `lookupGroups` и то же для контрагентов) с той же
 * формой ответа и теми же правилами, но асинхронное и без снимка: контроллер выбирает между ними по флагу `LMS_NORMALIZED_COLLECTIONS`.
 *
 * Правила скоупа — из снимка: представитель заказчика видит только своего контрагента и группы
 * своего контрагента; чужая запись отдаёт 404 с тем же кодом, что и несуществующая (иначе отказ
 * выдавал бы факт её существования). `lookup` и `getGroup` скоуп не применяют — как в снимке:
 * у представителя нет прав `groups.read`/`counterparties.read`, а у портала свои ручки.
 */
@Injectable()
export class MvpNormalizedReadsService {
  constructor(
    @Inject(COUNTERPARTIES_REPOSITORY) private readonly counterparties: CounterpartiesRepository,
    @Inject(GROUPS_REPOSITORY) private readonly groups: GroupsRepository,
    /* Срез 2b: слушатели. ПДн из таблицы — шифртекст; расшифровка здесь, до маскирования в контроллере. */
    @Inject(LEARNERS_REPOSITORY) private readonly learners: LearnersRepository,
    /* Срез 3b: зачисления и история статусов. */
    @Inject(ENROLLMENTS_REPOSITORY) private readonly enrollments: EnrollmentsRepository,
    /* Срез 4b: курсы группы и результаты экзаменов. */
    @Inject(GROUP_COURSES_REPOSITORY) private readonly groupCourses: GroupCoursesRepository,
    @Inject(EXAM_RESULTS_REPOSITORY) private readonly examResults: ExamResultsRepository
  ) {}

  listCounterparties(
    tenantId: string,
    query: BaseFilterQuery,
    actor?: { counterpartyId?: string }
  ): Promise<RegistryListPage<Counterparty>> {
    const scope = resolveCounterpartyScope(actor ?? {});
    return this.counterparties.list(
      tenantId,
      parseRegistryListQuery(query, COUNTERPARTY_SORT_COLUMNS, scope.restricted ? scope : undefined)
    );
  }

  async getCounterparty(
    tenantId: string,
    id: string,
    actor?: { counterpartyId?: string }
  ): Promise<Counterparty> {
    const scope = resolveCounterpartyScope(actor ?? {});
    if (scope.restricted && !scopeAllows(scope, id)) {
      throw new NotFoundException({ code: 'not_found', message: 'Counterparty not found' });
    }
    const found = await this.counterparties.get(tenantId, id);
    if (!found) throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    return found;
  }

  lookupCounterparties(
    tenantId: string,
    query: BaseFilterQuery
  ): Promise<RegistryListPage<LookupItem>> {
    return this.counterparties.lookup(
      tenantId,
      parseRegistryListQuery(query, COUNTERPARTY_SORT_COLUMNS)
    );
  }

  listGroups(
    tenantId: string,
    query: BaseFilterQuery,
    actor?: { counterpartyId?: string }
  ): Promise<RegistryListPage<GroupEntity>> {
    const scope = resolveCounterpartyScope(actor ?? {});
    return this.groups.list(
      tenantId,
      parseRegistryListQuery(query, GROUP_SORT_COLUMNS, scope.restricted ? scope : undefined)
    );
  }

  async getGroup(tenantId: string, id: string): Promise<GroupEntity> {
    const found = await this.groups.get(tenantId, id);
    if (!found) throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    return found;
  }

  lookupGroups(tenantId: string, query: BaseFilterQuery): Promise<RegistryListPage<LookupItem>> {
    return this.groups.lookup(tenantId, parseRegistryListQuery(query, GROUP_SORT_COLUMNS));
  }

  /**
   * Слушатели (срез 2b). Из таблицы ПДн приходят шифртекстом — расшифровываем каждую запись,
   * как это делает загрузка снимка; `maskLearnerRow` в контроллере работает уже с открытым
   * значением (иначе маска взяла бы цифры из шифртекста). Скоуп представителя не применяется:
   * у него нет `learners.read`, а портал остаётся на снимке до среза 3 (РМ37).
   */
  async listLearners(
    tenantId: string,
    query: BaseFilterQuery,
    actor?: { counterpartyId?: string }
  ): Promise<RegistryListPage<Learner>> {
    // Скоуп представителя заказчика (ФТ-E5) — в SQL через зачисления и группы (срез 3c, снимает РМ37).
    const scope = resolveCounterpartyScope(actor ?? {});
    const page = await this.learners.list(
      tenantId,
      parseRegistryListQuery(query, LEARNER_SORT_COLUMNS, scope.restricted ? scope : undefined)
    );
    return { ...page, items: page.items.map((item) => this.decrypt(item)) };
  }

  async getLearner(tenantId: string, id: string): Promise<Learner> {
    const found = await this.learners.get(tenantId, id);
    if (!found) throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    return this.decrypt(found);
  }

  lookupLearners(tenantId: string, query: BaseFilterQuery): Promise<RegistryListPage<LookupItem>> {
    return this.learners.lookup(tenantId, parseRegistryListQuery(query, LEARNER_SORT_COLUMNS));
  }

  async findLearnersBySnils(tenantId: string, snils: string): Promise<Learner[]> {
    return (await this.learners.findBySnils(tenantId, snils)).map((item) => this.decrypt(item));
  }

  private decrypt(learner: Learner): Learner {
    return decryptLearnerPiiAtRest(learner) as Learner;
  }

  /**
   * Зачисления (срез 3b) — правила §5.160 и ФТ-E5 ровно как в `MvpService.listEnrollments`:
   * без актора (внутренний вызов) и с правом обхода — без ограничения; иначе только зачисления
   * слушателей, привязанных к актору (нет привязки — пусто, закрыто по умолчанию); представитель
   * заказчика — только группы своего контрагента.
   */
  async listEnrollments(
    tenantId: string,
    query: BaseFilterQuery,
    access?: NormalizedReadAccess
  ): Promise<RegistryListPage<Enrollment>> {
    const learnerIds = await this.restrictLearnerIds(tenantId, access);
    const scope = resolveCounterpartyScope(access?.actor ?? {});
    return this.enrollments.list(
      tenantId,
      parseEnrollmentListQuery(query, learnerIds, scope.restricted ? scope : undefined)
    );
  }

  /** Карточка: 404 для чужого центра и несуществующей; 403 — чужой привязанный слушатель (как в снимке). */
  async getEnrollment(
    tenantId: string,
    id: string,
    access?: NormalizedReadAccess
  ): Promise<Enrollment> {
    const found = await this.enrollments.get(tenantId, id);
    if (!found) throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    await this.assertReadAllowedForLearner(tenantId, found.learnerId, access);
    return found;
  }

  /** История: неизвестное зачисление — пусто, а не 404 (как в снимке); проверка — только если найдено. */
  async listEnrollmentStatusHistory(
    tenantId: string,
    enrollmentId: string,
    access?: NormalizedReadAccess
  ): Promise<EnrollmentStatusHistory[]> {
    const found = await this.enrollments.get(tenantId, enrollmentId);
    if (found) await this.assertReadAllowedForLearner(tenantId, found.learnerId, access);
    return this.enrollments.history(tenantId, enrollmentId);
  }

  /** Курсы группы (срез 4b): скоупа нет — как в снимке (`groups.read` только у персонала). */
  async listGroupCourses(
    tenantId: string,
    query: BaseFilterQuery
  ): Promise<RegistryListPage<GroupCourse>> {
    return this.groupCourses.list(tenantId, parseGroupCourseListQuery(query));
  }

  async getGroupCourse(tenantId: string, id: string): Promise<GroupCourse> {
    const found = await this.groupCourses.get(tenantId, id);
    if (!found) throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    return found;
  }

  /**
   * Результаты экзаменов (срез 4b) — те же правила, что у зачислений: персонал с правом обхода
   * видит всё, слушатель — только свои (без привязки — пусто, закрыто по умолчанию).
   */
  async listExamResults(
    tenantId: string,
    query: BaseFilterQuery,
    access?: NormalizedReadAccess
  ): Promise<RegistryListPage<ExamResult>> {
    const learnerIds = await this.restrictLearnerIds(tenantId, access);
    return this.examResults.list(tenantId, parseExamResultListQuery(query, learnerIds));
  }

  /** Карточка результата: 404 для чужого центра и несуществующей; 403 — чужой привязанный слушатель. */
  async getExamResult(
    tenantId: string,
    id: string,
    access?: NormalizedReadAccess
  ): Promise<ExamResult> {
    const found = await this.examResults.get(tenantId, id);
    if (!found) throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    await this.assertReadAllowedForLearner(tenantId, found.learnerId, access);
    return found;
  }

  /** По зачислению: сначала 404 по зачислению, затем 403 по его слушателю — как в снимке. */
  async getExamResultByEnrollment(
    tenantId: string,
    enrollmentId: string,
    access?: NormalizedReadAccess
  ): Promise<ExamResult[]> {
    const enrollment = await this.enrollments.get(tenantId, enrollmentId);
    if (!enrollment) {
      throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    }
    await this.assertReadAllowedForLearner(tenantId, enrollment.learnerId, access);
    return this.examResults.byEnrollment(tenantId, enrollmentId);
  }

  private hasReadBypass(access: NormalizedReadAccess | undefined): boolean {
    const p = access?.permissions;
    return (
      !!p?.length &&
      (p.includes(ASSESSMENT_READ_CROSS_LEARNER_PERMISSION) ||
        p.includes(LEARNERS_ACT_AS_PERMISSION))
    );
  }

  /** `null` — без ограничения; массив — только эти слушатели (пустой — закрыто по умолчанию). */
  private async restrictLearnerIds(
    tenantId: string,
    access: NormalizedReadAccess | undefined
  ): Promise<string[] | null> {
    if (!access?.actorId) return null;
    if (this.hasReadBypass(access)) return null;
    return this.learners.learnerIdsByUser(tenantId, access.actorId);
  }

  private async assertReadAllowedForLearner(
    tenantId: string,
    learnerId: string,
    access: NormalizedReadAccess | undefined
  ): Promise<void> {
    if (!access?.actorId) return;
    if (this.hasReadBypass(access)) return;
    const learner = await this.learners.get(tenantId, learnerId);
    // Слушатель без карточки или без привязки — открыт для чтения, как в снимке.
    if (!learner?.linkedIamUserId) return;
    if (learner.linkedIamUserId !== access.actorId) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Access denied for this learner enrollment or attempt context'
      });
    }
  }
}
