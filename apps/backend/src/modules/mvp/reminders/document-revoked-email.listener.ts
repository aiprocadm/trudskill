import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  buildLearnerEmployerRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup
} from './reminder-recipients.js';
import { type NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';
import { DOCUMENT_REVOKED_EVENT } from '../../documents/document-revoked.event.js';
import { learnerRecipient } from '../enrollment-recipient.js';
import { type MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

import type { DispatchRecipient } from '../../communication/notification-dispatcher.service.js';
import type { DocumentRevokedPayload } from '../../documents/document-revoked.event.js';

@Injectable()
export class DocumentRevokedEmailListener {
  private readonly logger = new Logger(DocumentRevokedEmailListener.name);

  constructor(
    private readonly mvpRunner: MvpTenantRunner,
    private readonly dispatcher: NotificationDispatcher
  ) {}

  @OnEvent(DOCUMENT_REVOKED_EVENT, { async: true })
  async handle(payload: DocumentRevokedPayload): Promise<void> {
    if (!payload.sourceEntityId) {
      return;
    }
    try {
      const resolved = await this.mvpRunner.runWithTenantState(payload.tenantId, async (state) => {
        const enrollment = state.enrollments.find(
          (e) => e.tenantId === payload.tenantId && e.id === payload.sourceEntityId
        );
        if (!enrollment) {
          return null;
        }
        const learner = state.learners.find(
          (l) => l.tenantId === payload.tenantId && l.id === enrollment.learnerId
        );
        const recipients = buildLearnerEmployerRecipients(state, payload.tenantId, enrollment);
        const courseVersionId = resolveCourseVersionIdForGroup(
          state,
          payload.tenantId,
          enrollment.groupId
        );
        const courseTitle = courseVersionId
          ? resolveCourseTitleByVersion(state, payload.tenantId, courseVersionId)
          : undefined;
        return {
          recipients,
          learnerName: learnerRecipient(learner)?.name ?? '',
          courseTitle: courseTitle ?? ''
        } as { recipients: DispatchRecipient[]; learnerName: string; courseTitle: string };
      });

      if (!resolved || resolved.recipients.length === 0) {
        return;
      }

      await this.dispatcher.dispatch({
        tenantId: payload.tenantId,
        templateKey: 'document_revoked',
        recipients: resolved.recipients,
        variables: {
          learnerName: resolved.learnerName,
          courseTitle: resolved.courseTitle,
          reason: payload.reason
        },
        relatedEntityType: 'documents.generated_document',
        relatedEntityId: payload.documentId,
        dedupKey: `revoked:${payload.documentId}`
      });
    } catch (err) {
      this.logger.error(
        `Failed to dispatch document_revoked for document ${payload.documentId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
