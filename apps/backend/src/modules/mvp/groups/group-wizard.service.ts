import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Optional,
  Scope
} from '@nestjs/common';

import { normalizeGroupStatus } from './group-status.js';
import { classifyWizardLearnerRows } from './group-wizard-rows.js';
import { AuditService } from '../../audit/audit.service.js';
import { CounterpartyPeopleService } from '../counterparty-people/counterparty-people.service.js';
import { MvpService } from '../mvp.service.js';

import type { GroupCreationSettings } from './group-defaults.js';
import type { GroupWizardRequest, WizardAccessMode } from './group-wizard.dto.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { EmployeeLearnerResult } from '../counterparty-people/counterparty-people.types.js';
import type { GroupEntity, GroupWizardOutcome, GroupWizardOutcomeRow } from '../mvp.types.js';

/**
 * Мастер создания группы (ТЗ перехода §6.2 МГ-B2; Фаза 2, срез 8.4).
 *
 * Оркестрация поверх `MvpService` в одном запросе — значит, в одном сохранении снимка
 * (`MvpRequestPersistenceInterceptor`): группа, курсы, слушатели, зачисления. Правила:
 * группа создаётся всегда; отказ по слушателю — строкой с причиной (частичный успех);
 * статус группы — `recruiting`, а если начало ≤ сегодня центра — `in_progress` (РМ49);
 * зачисления — `active` при `enrollmentMode = auto` (РМ49); письмо-приглашение — только при
 * `access.mode = email`, `sheet` до МГ-C4 работает как `later` (РМ50). Повтор с тем же ключом
 * идемпотентности возвращает прежний результат.
 */
@Injectable({ scope: Scope.REQUEST })
export class GroupWizardService {
  constructor(
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(AuditService) private readonly auditService: AuditService,
    /* МГ-D2.1 (срез 14.4): «из сотрудников компании»; необязательна — тесты собирают мастер руками. */
    @Optional()
    @Inject(CounterpartyPeopleService)
    private readonly people?: CounterpartyPeopleService
  ) {}

  async complete(
    tenantId: string,
    actorId: string | undefined,
    request: GroupWizardRequest,
    context: RequestContext,
    settings: GroupCreationSettings
  ): Promise<GroupWizardOutcome> {
    const cached = this.mvp.getGroupWizardOutcomeIfAny(tenantId, request.idempotencyKey);
    if (cached) return cached;
    if (request.courses.length === 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Добавьте хотя бы один курс — без курса группе нечему учить.'
      });
    }
    /* МГ-B6.1: источник копии должен быть группой этого центра — иначе 404, как у любого чтения. */
    if (request.copyOfGroupId) this.mvp.getGroup(tenantId, request.copyOfGroupId);

    // 1. Группа: черновик достраивается, иначе создаётся; статус — по дате начала.
    const { draftId, ...fields } = request.group;
    const today = this.mvp.todayForTenant();
    const group = draftId
      ? this.completeDraft(tenantId, actorId, draftId, fields, context)
      : this.mvp.createGroup(tenantId, actorId, { ...fields, status: 'draft' }, context, settings);
    const targetStatus: 'recruiting' | 'in_progress' =
      group.startDate && group.startDate <= today ? 'in_progress' : 'recruiting';
    this.advanceGroup(tenantId, actorId, group, targetStatus, context);

    // 2. Курсы: уже назначенный — не ошибка, а «как есть».
    let coursesAssigned = 0;
    for (const course of request.courses) {
      try {
        this.mvp.createGroupCourse(
          tenantId,
          {
            groupId: group.id,
            courseId: course.courseId,
            ...(course.courseVersionId ? { courseVersionId: course.courseVersionId } : {}),
            ...(course.durationDays !== undefined ? { durationDays: course.durationDays } : {})
          },
          actorId,
          context
        );
        coursesAssigned += 1;
      } catch (error) {
        if (error instanceof ConflictException) continue;
        throw error;
      }
    }

    // 3. Слушатели: существующие + строки (дубли по СНИЛС/почте — переиспользуются).
    const rows: GroupWizardOutcomeRow[] = [];
    const learnerIds: string[] = [];
    const learnerRowByLearnerId = new Map<string, GroupWizardOutcomeRow>();
    for (const learnerId of request.learners?.existingIds ?? []) {
      const row: GroupWizardOutcomeRow = { rowNumber: 0, status: 'reused', learnerId };
      rows.push(row);
      learnerIds.push(learnerId);
      learnerRowByLearnerId.set(learnerId, row);
    }
    const classified = classifyWizardLearnerRows(request.learners?.rows ?? []);
    for (const bad of classified.rejected) {
      rows.push({
        rowNumber: bad.rowNumber,
        status: 'failed',
        errorCode: bad.code,
        errorMessage: bad.message
      });
    }
    const known = this.mvp.findLearnersByEmailOrSnils(
      tenantId,
      classified.accepted.map((r) => r.email ?? '').filter(Boolean),
      classified.accepted.map((r) => r.snils ?? '').filter(Boolean)
    );
    for (const parsed of classified.accepted) {
      const existing = known.find(
        (k) =>
          (parsed.snils && k.snils && k.snils.replace(/\D/g, '') === parsed.snils) ||
          (parsed.email && k.email && k.email.toLowerCase().trim() === parsed.email)
      );
      let row: GroupWizardOutcomeRow;
      if (existing) {
        row = { rowNumber: parsed.rowNumber, status: 'reused', learnerId: existing.id };
      } else {
        try {
          const learner = this.mvp.createLearnerExtended(
            tenantId,
            actorId,
            {
              firstName: parsed.firstName,
              lastName: parsed.lastName,
              ...(parsed.middleName ? { middleName: parsed.middleName } : {}),
              ...(parsed.email ? { email: parsed.email } : {}),
              ...(parsed.snils ? { snils: parsed.snils } : {}),
              ...(parsed.position ? { position: parsed.position } : {}),
              ...(parsed.phone ? { phone: parsed.phone } : {})
            },
            context
          );
          row = { rowNumber: parsed.rowNumber, status: 'created', learnerId: learner.id };
        } catch (error) {
          if (!(error instanceof HttpException)) throw error;
          const body = error.getResponse();
          const details =
            typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
          rows.push({
            rowNumber: parsed.rowNumber,
            status: 'failed',
            errorCode: typeof details.code === 'string' ? details.code : 'domain_rule_violation',
            errorMessage: typeof details.message === 'string' ? details.message : error.message
          });
          continue;
        }
      }
      rows.push(row);
      if (row.learnerId && !learnerRowByLearnerId.has(row.learnerId)) {
        learnerIds.push(row.learnerId);
        learnerRowByLearnerId.set(row.learnerId, row);
      }
    }

    // 3б. Из сотрудников компании (МГ-D2.1, срез 14.4, РМ120): сотрудник → слушатель, связь в обе
    //     стороны; без компании у группы — отказ строкой, а не всей группы.
    const employeeIds = request.learners?.employeeIds ?? [];
    if (employeeIds.length > 0) {
      const results: EmployeeLearnerResult[] =
        group.counterpartyId && this.people
          ? await this.people.learnersForEmployees(
              tenantId,
              group.counterpartyId,
              employeeIds,
              context,
              {
                findLearnerIdByEmail: (email) =>
                  this.mvp.findLearnersByEmailOrSnils(tenantId, [email], [])[0]?.id,
                createLearner: (employee) =>
                  this.mvp.createLearnerExtended(
                    tenantId,
                    actorId,
                    {
                      firstName: employee.firstName,
                      lastName: employee.lastName,
                      ...(employee.middleName ? { middleName: employee.middleName } : {}),
                      ...(employee.email ? { email: employee.email } : {}),
                      ...(employee.position ? { position: employee.position } : {}),
                      ...(employee.phone ? { phone: employee.phone } : {}),
                      counterpartyId: employee.counterpartyId
                    },
                    context
                  ).id
              }
            )
          : [...new Set(employeeIds)].map((employeeId) => ({
              employeeId,
              status: 'failed' as const,
              errorCode: 'wizard_employees_need_counterparty',
              errorMessage: 'Сотрудников можно зачислить, только когда у группы выбрана компания.'
            }));
      for (const result of results) {
        const row: GroupWizardOutcomeRow = {
          rowNumber: 0,
          status: result.status,
          employeeId: result.employeeId,
          ...(result.learnerId ? { learnerId: result.learnerId } : {}),
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          ...(result.errorMessage ? { errorMessage: result.errorMessage } : {})
        };
        rows.push(row);
        if (row.learnerId && !learnerRowByLearnerId.has(row.learnerId)) {
          learnerIds.push(row.learnerId);
          learnerRowByLearnerId.set(row.learnerId, row);
        }
      }
    }

    // 4. Зачисления и доступы.
    const activate = normalizeEnrollmentMode(group.enrollmentMode) === 'auto';
    const sendInvites = request.access.mode === 'email';
    let enrolledWithEmail = 0;
    if (learnerIds.length > 0) {
      const outcome = this.mvp.createBulkEnrollments(
        tenantId,
        actorId,
        {
          idempotencyKey: `${request.idempotencyKey}::wizard-enroll`,
          groupId: group.id,
          learnerIds
        },
        context,
        { activate, suppressInvite: !sendInvites }
      );
      for (const enrollment of outcome.created) {
        const row = learnerRowByLearnerId.get(enrollment.learnerId);
        if (row) row.enrollmentId = enrollment.id;
        if (sendInvites && this.mvp.getLearner(tenantId, enrollment.learnerId).email) {
          enrolledWithEmail += 1;
        }
      }
      for (const skipped of outcome.skippedExisting) {
        const row = learnerRowByLearnerId.get(skipped.learnerId);
        if (row) {
          row.enrollmentId = skipped.enrollmentId;
          row.status = row.status === 'created' ? 'created' : 'enrolled_only';
        }
      }
      for (const failed of outcome.errors) {
        const row = learnerRowByLearnerId.get(failed.learnerId);
        if (row) {
          row.status = 'failed';
          row.errorCode = failed.code;
          row.errorMessage = failed.message;
        }
      }
    }

    const result: GroupWizardOutcome = {
      idempotencyKey: request.idempotencyKey,
      group,
      coursesAssigned,
      enrollments: {
        total: rows.length,
        created: rows.filter((r) => r.status === 'created').length,
        reused: rows.filter((r) => r.status === 'reused' || r.status === 'enrolled_only').length,
        failed: rows.filter((r) => r.status === 'failed').length,
        rows
      },
      access: {
        mode: request.access.mode,
        sent: enrolledWithEmail,
        sheetFileId: null,
        deferred: request.access.mode !== 'email'
      }
    };
    this.mvp.saveGroupWizardOutcome(tenantId, request.idempotencyKey, result);
    this.auditService.write({
      tenantId,
      actorId: actorId ?? 'system',
      action: 'learning.group_wizard_completed',
      entityType: 'learning.group',
      entityId: group.id,
      newValues: {
        idempotencyKey: request.idempotencyKey,
        status: group.status,
        coursesAssigned,
        learnersTotal: rows.length,
        learnersFailed: result.enrollments.failed,
        accessMode: request.access.mode,
        ...(request.copyOfGroupId ? { copyOfGroupId: request.copyOfGroupId } : {})
      }
    });
    return result;
  }

  /** Черновик из шага 1: тот же id, поля дописываются, статус — из `draft`. */
  private completeDraft(
    tenantId: string,
    actorId: string | undefined,
    draftId: string,
    fields: Omit<GroupWizardRequest['group'], 'draftId'>,
    context: RequestContext
  ): GroupEntity {
    const current = this.mvp.getGroup(tenantId, draftId);
    if (normalizeGroupStatus(current.status) !== 'draft') {
      throw new ConflictException({
        code: 'conflict',
        message:
          'Эта группа уже создана — черновиком её достроить нельзя. Откройте карточку группы.'
      });
    }
    const { status: _ignored, ...rest } = fields;
    void _ignored;
    return this.mvp.updateGroup(tenantId, actorId, draftId, rest, context);
  }

  /** draft → recruiting (→ in_progress): по одному соседнему переходу, как требует машина состояний. */
  private advanceGroup(
    tenantId: string,
    actorId: string | undefined,
    group: GroupEntity,
    target: 'recruiting' | 'in_progress',
    context: RequestContext
  ): void {
    const path: Array<'recruiting' | 'in_progress'> =
      target === 'in_progress' ? ['recruiting', 'in_progress'] : ['recruiting'];
    for (const status of path) {
      if (normalizeGroupStatus(group.status) === status) continue;
      this.mvp.setGroupStatus(tenantId, actorId, group.id, { status }, context);
    }
  }
}

const normalizeEnrollmentMode = (raw: unknown): 'auto' | 'manual' =>
  raw === 'manual' ? 'manual' : 'auto';

export type { WizardAccessMode };
