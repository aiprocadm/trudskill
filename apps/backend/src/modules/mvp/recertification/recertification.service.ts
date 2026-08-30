import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { selectExpiringDocuments, summarize } from './expiring-documents.util.js';
import {
  RECERTIFICATION_DRAFTS_REPOSITORY,
  type RecertificationDraftRow,
  type RecertificationDraftsQuery,
  type RecertificationDraftsRepository
} from './recertification-drafts.repository.js';
import {
  RECERT_HORIZON_DAYS,
  type RecertScanSummary,
  RecertificationScanner
} from './recertification-scanner.service.js';
import { todayIn } from '../../../common/utils/tenant-calendar.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsTenantRunner } from '../../documents/documents-tenant-runner.service.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';
import {
  resolveCourseTitleByVersion,
  resolveLearnerDisplay
} from '../reminders/reminder-recipients.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

// Re-export so existing importers of these symbols keep working.
export {
  RECERT_HORIZON_DAYS,
  scanForRecertification,
  type RecertCandidate,
  type RecertScanSummary
} from './recertification-scanner.service.js';

export interface RecertificationDraftView extends RecertificationDraftRow {
  learnerName: string;
  learnerSnils?: string;
  courseTitle: string;
}

@Injectable()
export class RecertificationService {
  constructor(
    @Inject(RECERTIFICATION_DRAFTS_REPOSITORY)
    private readonly drafts: RecertificationDraftsRepository,
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(RecertificationScanner) private readonly scanner: RecertificationScanner,
    @Inject(DocumentsTenantRunner) private readonly documentsRunner: DocumentsTenantRunner,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /*
   * След решения по переаттестации (ревизия 2026-08-26, ФТ-G1).
   *
   * Одобрение создаёт зачисление, и зачисление в журнале видно, — а вот САМО РЕШЕНИЕ нет.
   * Отклонение не оставляло следа вообще: человек не пошёл на переаттестацию, и по журналу
   * нельзя было сказать, кто и почему так решил. Для обязательного обучения это ровно тот
   * вопрос, который задают потом.
   */
  private auditDecision(
    tenantId: string,
    action: string,
    draftId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext
  ) {
    this.auditService.write({
      tenantId,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      action,
      entityType: 'recertification_draft',
      entityId: draftId,
      newValues,
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx.ip ? { ip: ctx.ip } : {}),
      ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {})
    });
  }

  /**
   * ФТ-E4: дашборд «истекающие удостоверения». Горизонт совпадает с окном скана
   * напоминаний — методист видит ровно те документы, по которым уже идут письма.
   */
  /**
   * `today` по умолчанию — календарь ЦЕНТРА (журнал 301). Планировщик передаёт свою дату
   * явно; экран не должен знать про часовые пояса вовсе.
   */
  async listExpiring(
    tenantId: string,
    today: string = todayIn(this.state.tenantTimezone),
    horizonDays = RECERT_HORIZON_DAYS
  ) {
    const documents = await this.documentsRunner.runWithTenantDocuments(
      tenantId,
      async (docs) => docs.listDocuments(tenantId, { pageSize: Number.MAX_SAFE_INTEGER }).items
    );
    const items = selectExpiringDocuments(today, documents as never, horizonDays);
    return { items, summary: summarize(items), horizonDays };
  }

  /** Manual per-tenant scan (HTTP-triggered). The interceptor has already loaded `this.state`. */
  runScan(
    tenantId: string,
    asOf: string = todayIn(this.state.tenantTimezone),
    _ctx?: RequestContext
  ): Promise<RecertScanSummary> {
    return this.scanner.scanTenant(tenantId, asOf, this.state);
  }

  async listDrafts(
    tenantId: string,
    query: RecertificationDraftsQuery
  ): Promise<RecertificationDraftView[]> {
    const rows = await this.drafts.list(tenantId, query);
    return rows.map((row) => {
      const learner = resolveLearnerDisplay(this.state, tenantId, row.learnerId);
      return {
        ...row,
        learnerName: learner.name,
        ...(learner.snils ? { learnerSnils: learner.snils } : {}),
        courseTitle: resolveCourseTitleByVersion(this.state, tenantId, row.courseVersionId) ?? ''
      };
    });
  }

  /**
   * Approve a pending draft: enroll the learner into the chosen target group via the
   * bulk-enroll path (idempotent per draft) and stamp the draft approved with the
   * resulting enrollment id.
   */
  async approveDraft(
    tenantId: string,
    draftId: string,
    targetGroupId: string,
    ctx: RequestContext
  ): Promise<RecertificationDraftRow | null> {
    const draft = await this.drafts.getById(tenantId, draftId);
    if (!draft) {
      throw new NotFoundException({
        code: 'recertification_draft_not_found',
        message: 'Черновик переаттестации не найден'
      });
    }
    if (draft.status !== 'pending') {
      throw new BadRequestException({
        code: 'recertification_draft_not_pending',
        message: 'Решение по черновику переаттестации уже принято'
      });
    }

    const outcome = this.mvp.createBulkEnrollments(
      tenantId,
      ctx.userId,
      {
        groupId: targetGroupId,
        learnerIds: [draft.learnerId],
        idempotencyKey: `recert_${draftId}::approve::${targetGroupId}`
      },
      ctx
    );
    const enrollmentId = outcome.created[0]?.id ?? outcome.skippedExisting[0]?.enrollmentId;
    if (!enrollmentId) {
      const reason = outcome.errors[0]?.message;
      throw new BadRequestException({
        code: 'recertification_enrollment_failed',
        message: reason
          ? `Не удалось создать зачисление для переаттестации: ${reason}`
          : 'Не удалось создать зачисление для переаттестации'
      });
    }

    const approved = await this.drafts.markApproved(tenantId, draftId, enrollmentId, ctx.userId);
    this.auditDecision(
      tenantId,
      'learning.recertification_approved',
      draftId,
      {
        learnerId: draft.learnerId,
        targetGroupId,
        enrollmentId
      },
      ctx
    );
    return approved;
  }

  async rejectDraft(
    tenantId: string,
    draftId: string,
    reason: string | undefined,
    ctx: RequestContext
  ): Promise<RecertificationDraftRow | null> {
    const draft = await this.drafts.getById(tenantId, draftId);
    if (!draft) {
      throw new NotFoundException({
        code: 'recertification_draft_not_found',
        message: 'Черновик переаттестации не найден'
      });
    }
    const rejected = await this.drafts.markRejected(tenantId, draftId, reason, ctx.userId);
    this.auditDecision(
      tenantId,
      'learning.recertification_rejected',
      draftId,
      {
        learnerId: draft.learnerId,
        ...(reason ? { reason } : {})
      },
      ctx
    );
    return rejected;
  }
}
