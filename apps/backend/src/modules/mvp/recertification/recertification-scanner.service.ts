import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  RECERTIFICATION_DRAFTS_REPOSITORY,
  type RecertificationDraftsRepository
} from './recertification-drafts.repository.js';
import { addDays } from '../../../common/utils/date-math.util.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';
import { DocumentsTenantRunner } from '../../documents/documents-tenant-runner.service.js';
import { RECERT_MILESTONES, pickMilestone } from '../reminders/milestone.util.js';
import {
  buildLearnerEmployerRecipients,
  buildStaffRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup,
  resolveLearnerDisplay
} from '../reminders/reminder-recipients.js';

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
 * Pure selection: keep generated (non-revoked) documents whose validUntil falls at or before
 * today+horizon (includes already-expired). String date comparison is safe because validUntil
 * is canonical YYYY-MM-DD.
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

/**
 * Singleton scan body shared by the request-scoped RecertificationService (manual endpoint) and
 * the nightly RemindersSchedulerService. Reads MVP data from the passed-in state (so it works
 * both inside an HTTP request and inside the cron via MvpTenantRunner). Dispatches a
 * `recertification_due` notice once per 90/30/7 milestone (deduped by the dispatcher).
 */
@Injectable()
export class RecertificationScanner {
  private readonly logger = new Logger(RecertificationScanner.name);

  constructor(
    @Inject(RECERTIFICATION_DRAFTS_REPOSITORY)
    private readonly drafts: RecertificationDraftsRepository,
    @Inject(NotificationDispatcher)
    private readonly dispatcher: NotificationDispatcher,
    @Inject(DocumentsTenantRunner)
    private readonly documentsRunner: DocumentsTenantRunner
  ) {}

  async scanTenant(
    tenantId: string,
    asOf: string,
    state: InMemoryMvpState
  ): Promise<RecertScanSummary> {
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

    // Staff copy is tenant-wide and loop-invariant — resolve once (mirrors license-expiry-scanner).
    const staffRecipients = buildStaffRecipients(state, tenantId);

    for (const candidate of candidates) {
      const enrollment = state.enrollments.find(
        (e) => e.tenantId === tenantId && e.id === candidate.sourceEntityId
      );
      if (!enrollment) continue;

      const courseVersionId = resolveCourseVersionIdForGroup(state, tenantId, enrollment.groupId);
      if (!courseVersionId) continue;

      const { row, created } = await this.drafts.create({
        tenantId,
        learnerId: enrollment.learnerId,
        sourceDocumentId: candidate.documentId,
        courseVersionId,
        validUntil: candidate.validUntil
      });
      if (created) draftsCreated++;

      const milestone = pickMilestone(asOf, candidate.validUntil, RECERT_MILESTONES);
      if (milestone === null) continue;

      const recipients = [
        ...buildLearnerEmployerRecipients(state, tenantId, enrollment),
        ...staffRecipients
      ];
      if (recipients.length === 0) continue;

      try {
        const summary = await this.dispatcher.dispatch({
          tenantId,
          templateKey: 'recertification_due',
          recipients,
          variables: {
            learnerName: resolveLearnerDisplay(state, tenantId, enrollment.learnerId).name,
            courseTitle: resolveCourseTitleByVersion(state, tenantId, courseVersionId) ?? '',
            validUntil: candidate.validUntil
          },
          relatedEntityType: 'recertification_draft',
          relatedEntityId: row.id,
          dedupKey: `recert:${row.id}:${milestone}`
        });
        emailsDispatched += summary.sent;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch recertification_due for draft ${row.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { draftsCreated, emailsDispatched };
  }
}
