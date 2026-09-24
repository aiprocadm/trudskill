import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { formatRussianDateWords } from './date-words.js';
import {
  resolveCounterpartyVariables,
  resolveCourseVariables,
  resolveGroupVariables,
  resolveLearnerVariables,
  resolveTenantVariables
} from './entity-variables.js';
import {
  resolveCommissionVariables,
  resolveDocumentVariables,
  resolveEnrollmentVariables,
  resolveGroupLearnersVariables,
  resolveProgramVariables
} from './pillar-a-variables.js';
import { allVariableCodes } from './variable-catalog.js';
import { todayIn } from '../../common/utils/tenant-calendar.js';
import { backendEnv } from '../../env.js';
import { TenantTimezoneService } from '../../infrastructure/tenant/tenant-timezone.service.js';
import { MvpTenantRunner } from '../mvp/infrastructure/mvp-tenant-runner.service.js';
import {
  extraFieldVariableCode,
  learnerExtraFieldsFrom,
  resolveExtraFieldVariables
} from '../mvp/learners/learner-extra-fields.js';
import { REGULATORY_ACTS_SEED } from '../mvp/regulatory-acts.seed.js';
import { LicensesService } from '../org/licenses.service.js';
import { TenantService } from '../tenant/tenant.service.js';

import type { DocumentGenerationTaskEntity, GeneratedDocumentEntity } from './documents.types.js';
import type { InMemoryMvpState } from '../mvp/infrastructure/in-memory-mvp.state.js';
import type { Commission, CommissionMember, Enrollment, Learner } from '../mvp/mvp.types.js';
import type { TrainingLicense } from '../org/licenses.types.js';

/**
 * Сборка словаря подстановки для рендера бланка (ФТ-A2.3, Фаза 1 Task 4).
 *
 * Резолверы категорий — pure functions (`pillar-a-variables.ts`, `entity-variables.ts`),
 * им нужны готовые снимки. Этот сервис и есть тот caller, которого они ждали: проходит
 * цепочку `задача → запись на обучение → слушатель / группа → заказчик / курс → версия
 * программы → комиссия`, добирает данные центра (реквизиты, лицензии) и склеивает выход
 * всех десяти категорий в один плоский словарь.
 *
 * MVP-состояние читается через `MvpTenantRunner`, собранный из инфраструктуры БЕЗ импорта
 * `MvpModule` — иначе получилась бы циклическая зависимость (MvpModule уже импортирует
 * DocumentsModule). Тот же приём применён в `CommunicationModule` для web-push.
 *
 * Данные, которых нет (нет заказчика у группы, нет комиссии у программы), дают пустые
 * строки: бланк печатается с прочерком, а не падает.
 */
@Injectable()
export class DocumentVariablesBuilder {
  private readonly logger = new Logger(DocumentVariablesBuilder.name);

  constructor(
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Optional() @Inject(TenantService) private readonly tenants?: TenantService,
    @Optional() @Inject(LicensesService) private readonly licenses?: LicensesService,
    /* Пояс центра — последним и необязательным (журнал 301). */
    @Optional()
    @Inject(TenantTimezoneService)
    private readonly timezones?: TenantTimezoneService
  ) {}

  /** Пояс центра, разрешённый на время сборки словаря. */
  private tenantTimezone: string | undefined = undefined;

  /**
   * @param document уже созданный документ (номер, дата, QR) — если он есть на момент
   * вызова. При рендере его ещё нет, поэтому категория `document.*` дозаполняется
   * из задачи и зарезервированного номера.
   */
  async build(params: {
    tenantId: string;
    task: DocumentGenerationTaskEntity;
    reservedNumber?: string;
    document?: GeneratedDocumentEntity;
  }): Promise<Record<string, unknown>> {
    // МГ-C1.3 (РМ86): именованные поля центра — свои коды поверх общего каталога.
    const codes = [...allVariableCodes(), ...(await this.extraLearnerCodes(params.tenantId))];
    // Пояс центра нужен запасной дате выпуска (журнал 301) — разрешаем один раз на сборку.
    this.tenantTimezone = await this.timezones?.resolve(params.tenantId);
    const [mvpVariables, tenantVariables] = await Promise.all([
      this.buildFromMvpState(params.tenantId, params.task, codes),
      this.buildTenantVariables(params.tenantId, codes)
    ]);

    // Скелет из ВСЕХ кодов каталога: словарь одинаковой формы независимо от того, нашлись
    // ли сущности. Иначе снапшот (ФТ-A1.4) вышел бы разным по составу ключей, а перевыпуск
    // из него — не эквивалентным первой выдаче.
    const skeleton: Record<string, unknown> = {};
    for (const code of codes) skeleton[code] = '';

    return {
      ...skeleton,
      ...tenantVariables,
      ...mvpVariables,
      ...this.buildDocumentVariables(params, codes)
    };
  }

  /** Коды `learner.extra.<ключ>` из настроек центра; без настроек или без базы — пусто. */
  private async extraLearnerCodes(tenantId: string): Promise<string[]> {
    if (!this.tenants) return [];
    try {
      const stored = await this.tenants.getSettings(tenantId);
      return learnerExtraFieldsFrom(stored.payload).map((def) => extraFieldVariableCode(def.key));
    } catch {
      // Настроек у центра может не быть — документ собирается без именованных полей.
      return [];
    }
  }

  /** Категория `document.*` + дата прописью (её нет в pure-резолвере). */
  private buildDocumentVariables(
    params: {
      task: DocumentGenerationTaskEntity;
      reservedNumber?: string;
      document?: GeneratedDocumentEntity;
    },
    codes: string[]
  ): Record<string, unknown> {
    /*
     * Запасная дата — по календарю центра, а не по UTC (журнал 301). Она подставляется,
     * когда бланк рисуют ДО выпуска (предпросмотр): в поясе за Уралом UTC-дата показывала
     * вчерашний день, и предпросмотр расходился с тем, что окажется на документе.
     */
    const issueDate = params.document?.documentDate ?? todayIn(this.tenantTimezone);
    const snapshotDocument: GeneratedDocumentEntity = {
      ...(params.document ??
        ({
          id: '',
          documentType: params.task.documentType,
          documentNumber: params.reservedNumber ?? '',
          documentDate: issueDate
        } as GeneratedDocumentEntity)),
      documentNumber: params.document?.documentNumber ?? params.reservedNumber ?? '',
      documentDate: issueDate
    };
    return {
      ...resolveDocumentVariables(
        { document: snapshotDocument, publicBaseUrl: backendEnv.PUBLIC_BASE_URL },
        codes.filter((code) => code.startsWith('document.'))
      ),
      'document.issue_date_words': formatRussianDateWords(issueDate)
    };
  }

  /** Данные учебного центра: имя, реквизиты, действующие лицензия и аккредитация. */
  private async buildTenantVariables(
    tenantId: string,
    codes: string[]
  ): Promise<Record<string, unknown>> {
    const tenantCodes = codes.filter((code) => code.startsWith('tenant.'));
    if (!this.tenants) {
      return resolveTenantVariables(
        { tenant: { id: tenantId, code: '', name: '', status: 'active' } },
        tenantCodes
      );
    }
    try {
      const [tenant, requisites, licenses] = await Promise.all([
        this.tenants.getTenantById(tenantId),
        this.tenants.getRequisites(tenantId).catch(() => undefined),
        this.licenses?.list(tenantId, 'active').catch(() => [] as TrainingLicense[]) ??
          Promise.resolve([] as TrainingLicense[])
      ]);
      return resolveTenantVariables(
        {
          tenant,
          ...(requisites ? { requisites } : {}),
          ...(licenses ? { licenses } : {})
        },
        tenantCodes
      );
    } catch (error) {
      // Реквизиты центра не должны блокировать выдачу документа: пишем предупреждение
      // и рендерим бланк с пустой шапкой — админ увидит это в предпросмотре.
      this.logger.warn(
        `Tenant variables unavailable for ${tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return resolveTenantVariables(
        { tenant: { id: tenantId, code: '', name: '', status: 'active' } },
        tenantCodes
      );
    }
  }

  /** Всё, что живёт в MVP-состоянии: слушатель, группа, заказчик, курс, программа, комиссия. */
  private async buildFromMvpState(
    tenantId: string,
    task: DocumentGenerationTaskEntity,
    codes: string[]
  ): Promise<Record<string, unknown>> {
    const pick = (prefix: string): string[] => codes.filter((code) => code.startsWith(prefix));
    try {
      return await this.mvpRunner.runWithTenantState(tenantId, async (state) =>
        this.resolveFromState(state, tenantId, task, pick, codes)
      );
    } catch (error) {
      this.logger.warn(
        `MVP variables unavailable for task ${task.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {};
    }
  }

  private resolveFromState(
    state: InMemoryMvpState,
    tenantId: string,
    task: DocumentGenerationTaskEntity,
    pick: (prefix: string) => string[],
    codes: string[]
  ): Record<string, unknown> {
    const scoped = <T extends { tenantId: string }>(items: T[]): T[] =>
      items.filter((item) => item.tenantId === tenantId);

    // Источник документа — обычно запись на обучение (enrollment).
    const enrollment =
      task.sourceEntityType === 'enrollment'
        ? scoped(state.enrollments).find((item) => item.id === task.sourceEntityId)
        : undefined;

    const learner = enrollment
      ? scoped(state.learners).find((item) => item.id === enrollment.learnerId)
      : undefined;
    const group = enrollment
      ? scoped(state.groups).find((item) => item.id === enrollment.groupId)
      : undefined;
    const counterparty = group?.counterpartyId
      ? scoped(state.counterparties).find((item) => item.id === group.counterpartyId)
      : undefined;

    // Курс у записи только через группу: enrollment → group → group_courses → course.
    const groupCourse = group
      ? scoped(state.groupCourses).find((item) => item.groupId === group.id)
      : undefined;
    const course = groupCourse
      ? scoped(state.courses).find((item) => item.id === groupCourse.courseId)
      : undefined;
    const courseVersion = groupCourse?.courseVersionId
      ? scoped(state.courseVersions).find((item) => item.id === groupCourse.courseVersionId)
      : scoped(state.courseVersions).find((item) => item.courseId === course?.id);

    const commission: Commission | undefined = courseVersion?.commissionId
      ? scoped(state.commissions).find((item) => item.id === courseVersion.commissionId)
      : undefined;
    const commissionMembers: CommissionMember[] = commission
      ? scoped(state.commissionMembers).filter((item) => item.commissionId === commission.id)
      : [];

    // Таблица протокола: все слушатели группы, а не только текущий.
    const groupEnrollments: Enrollment[] = group
      ? scoped(state.enrollments).filter((item) => item.groupId === group.id)
      : [];
    const groupLearners: Learner[] = scoped(state.learners).filter((item) =>
      groupEnrollments.some((e) => e.learnerId === item.id)
    );

    const result: Record<string, unknown> = {
      ...resolveGroupVariables(
        { ...(group ? { group } : {}), ...(counterparty ? { counterparty } : {}) },
        pick('group.')
      ),
      ...resolveCourseVariables({ ...(course ? { course } : {}) }, pick('course.')),
      ...resolveCounterpartyVariables(
        { ...(counterparty ? { counterparty } : {}) },
        pick('counterparty.')
      ),
      ...resolveGroupLearnersVariables(
        { learners: groupLearners, enrollments: groupEnrollments },
        codes.filter((code) => code.startsWith('group_learners'))
      )
    };

    if (learner) {
      Object.assign(result, resolveLearnerVariables({ learner }, pick('learner.')));
      // После общих переменных: `learner.extra.*` общий резолвер вернул бы пустыми.
      Object.assign(
        result,
        resolveExtraFieldVariables(learner.extraFields, pick('learner.extra.'))
      );
    }
    if (enrollment) {
      Object.assign(result, resolveEnrollmentVariables({ enrollment }, pick('enrollment.')));
    }
    if (courseVersion) {
      Object.assign(
        result,
        resolveProgramVariables(
          {
            courseVersion,
            regulatoryActs: REGULATORY_ACTS_SEED,
            ...(commission ? { commission } : {})
          },
          pick('program.')
        )
      );
    }
    if (commission) {
      Object.assign(
        result,
        resolveCommissionVariables({ commission, members: commissionMembers }, pick('commission.'))
      );
    }
    return result;
  }
}
