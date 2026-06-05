import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  RECERTIFICATION_DRAFTS_REPOSITORY,
  type RecertificationDraftRow,
  type RecertificationDraftsQuery,
  type RecertificationDraftsRepository
} from './recertification-drafts.repository.js';
import { addDays } from '../../../common/utils/date-math.util.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';
import { DocumentsTenantRunner } from '../../documents/documents-tenant-runner.service.js';
import { learnerRecipient } from '../enrollment-recipient.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { DispatchRecipient } from '../../communication/notification-dispatcher.service.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/** Phase 5B — окно опережения: документы с validUntil ≤ today+90d попадают в скан. */
export const RECERT_HORIZON_DAYS = 90;

export interface RecertCandidate {
  documentId: string;
  sourceEntityId: string;
  validUntil: string;
}

export interface RecertScanSummary {
  draftsCreated: number;
  emailsDispatched: number;
}

/**
 * Pure selection: keep generated (non-revoked) documents whose validUntil falls at or
 * before today+horizon (includes already-expired ones). String date comparison is safe
 * because validUntil is canonical YYYY-MM-DD.
 */
export function scanForRecertification(
  asOf: string,
  documents: Array<{
    id: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    status?: string;
    revokedAt?: string;
    validUntil?: string;
  }>,
  horizonDays: number
): RecertCandidate[] {
  const horizon = addDays(asOf, horizonDays);
  return documents
    .filter(
      (d) => !!d.validUntil && d.status !== 'revoked' && !d.revokedAt && d.validUntil <= horizon
    )
    .map((d) => ({
      documentId: d.id,
      sourceEntityId: d.sourceEntityId ?? '',
      validUntil: d.validUntil as string
    }));
}

@Injectable()
export class RecertificationService {
  constructor(
    @Inject(RECERTIFICATION_DRAFTS_REPOSITORY)
    private readonly drafts: RecertificationDraftsRepository,
    private readonly dispatcher: NotificationDispatcher,
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    private readonly mvp: MvpService,
    private readonly documentsRunner: DocumentsTenantRunner
  ) {}

  /**
   * Scan the tenant's generated documents for upcoming/expired certificate validity,
   * upsert a recertification draft per affected enrollment (idempotent on the source
   * document), and dispatch a `recertification_due` notice once per newly-created draft.
   */
  async runScan(tenantId: string, asOf: string, _ctx: RequestContext): Promise<RecertScanSummary> {
    // pageSize big enough to read the whole tenant's document set in one page.
    const candidates = await this.documentsRunner.runWithTenantDocuments(
      tenantId,
      async (documents) =>
        scanForRecertification(
          asOf,
          documents.listDocuments(tenantId, { pageSize: Number.MAX_SAFE_INTEGER }).items,
          RECERT_HORIZON_DAYS
        )
    );

    let draftsCreated = 0;
    let emailsDispatched = 0;

    for (const candidate of candidates) {
      const enrollment = this.state.enrollments.find(
        (e) => e.tenantId === tenantId && e.id === candidate.sourceEntityId
      );
      if (!enrollment) continue;

      const courseVersionId = this.state.groupCourses.find(
        (gc) => gc.tenantId === tenantId && gc.groupId === enrollment.groupId && gc.courseVersionId
      )?.courseVersionId;
      if (!courseVersionId) continue;

      const { row, created } = await this.drafts.create({
        tenantId,
        learnerId: enrollment.learnerId,
        sourceDocumentId: candidate.documentId,
        courseVersionId,
        validUntil: candidate.validUntil
      });
      if (!created) continue;
      draftsCreated++;

      const learner = this.state.learners.find(
        (l) => l.tenantId === tenantId && l.id === enrollment.learnerId
      );
      const recipients: DispatchRecipient[] = [];
      const learnerRcpt = learnerRecipient(learner);
      if (learnerRcpt) {
        recipients.push({ email: learnerRcpt.email, name: learnerRcpt.name, kind: 'learner' });
      }
      const employerEmail = this.resolveEmployerEmail(tenantId, enrollment.groupId);
      if (employerEmail) {
        recipients.push({ email: employerEmail, kind: 'employer' });
      }

      if (recipients.length > 0) {
        await this.dispatcher.dispatch({
          tenantId,
          templateKey: 'recertification_due',
          recipients,
          variables: {
            learnerName: learnerRcpt?.name ?? '',
            courseTitle: this.resolveCourseTitle(tenantId, courseVersionId) ?? '',
            validUntil: candidate.validUntil
          },
          relatedEntityType: 'recertification_draft',
          relatedEntityId: row.id
        });
        emailsDispatched += recipients.length;
      }
    }

    return { draftsCreated, emailsDispatched };
  }

  listDrafts(
    tenantId: string,
    query: RecertificationDraftsQuery
  ): Promise<RecertificationDraftRow[]> {
    return this.drafts.list(tenantId, query);
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
        idempotencyKey: `recert_${draftId}::approve`
      },
      ctx
    );
    const enrollmentId = outcome.created[0]?.id ?? outcome.skippedExisting[0]?.enrollmentId;
    if (!enrollmentId) {
      throw new BadRequestException({
        code: 'recertification_enrollment_failed',
        message: 'Не удалось создать зачисление для переаттестации'
      });
    }

    return this.drafts.markApproved(tenantId, draftId, enrollmentId, ctx.userId);
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
    return this.drafts.markRejected(tenantId, draftId, reason, ctx.userId);
  }

  private resolveEmployerEmail(tenantId: string, groupId: string): string | undefined {
    const group = this.state.groups.find((g) => g.tenantId === tenantId && g.id === groupId);
    if (!group?.counterpartyId) return undefined;
    return this.state.counterparties.find(
      (c) => c.tenantId === tenantId && c.id === group.counterpartyId
    )?.contactEmail;
  }

  private resolveCourseTitle(tenantId: string, courseVersionId: string): string | undefined {
    const cv = this.state.courseVersions.find(
      (v) => v.tenantId === tenantId && v.id === courseVersionId
    );
    const course =
      cv && this.state.courses.find((c) => c.tenantId === tenantId && c.id === cv.courseId);
    return course ? course.title : undefined;
  }
}
