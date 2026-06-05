import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { type DocumentsTenantRunner } from './documents-tenant-runner.service.js';
import { addMonths } from '../../common/utils/date-math.util.js';
import { type AuditService } from '../audit/audit.service.js';
import {
  ENROLLMENT_COMPLETED_EVENT,
  type EnrollmentCompletedDocumentSetEntry,
  type EnrollmentCompletedPayload
} from '../mvp/enrollment-completed.event.js';

import type { RequestContext } from '../../common/context/request-context.js';

const CERTIFICATE_DOCUMENT_TYPE = 'certificate';

function enrollmentTraceRequestContext(
  payload: EnrollmentCompletedPayload
): RequestContext | undefined {
  if (payload.requestId === undefined && payload.correlationId === undefined) {
    return undefined;
  }
  const { enrollmentId } = payload;
  return {
    requestId: payload.requestId ?? `learning.enrollment_completed:${payload.enrollmentId}`,
    correlationId:
      payload.correlationId ?? payload.requestId ?? `learning.enrollment_completed:${enrollmentId}`
  };
}

@Injectable()
export class EnrollmentDocumentIssuanceListener {
  constructor(
    private readonly documentsRunner: DocumentsTenantRunner,
    private readonly auditService: AuditService
  ) {}

  @OnEvent(ENROLLMENT_COMPLETED_EVENT, { async: true })
  handleEnrollmentCompleted(payload: EnrollmentCompletedPayload): void {
    setImmediate(() => {
      void this.issueDocuments(payload);
    });
  }

  private async issueDocuments(payload: EnrollmentCompletedPayload): Promise<void> {
    const autoIssueEntries = (payload.documentSet ?? [])
      .filter((entry) => entry.autoIssueOnCompletion)
      .sort((a, b) => a.position - b.position);

    if (autoIssueEntries.length > 0) {
      await this.issueDocumentSet(payload, autoIssueEntries);
      return;
    }
    await this.issueLegacyCertificate(payload);
  }

  private async issueDocumentSet(
    payload: EnrollmentCompletedPayload,
    autoIssueEntries: EnrollmentCompletedDocumentSetEntry[]
  ): Promise<void> {
    const { tenantId, enrollmentId, actorId } = payload;
    const traceCtx = enrollmentTraceRequestContext(payload);
    try {
      await this.documentsRunner.runWithTenantDocuments(tenantId, async (documents) => {
        for (const entry of autoIssueEntries) {
          const validUntil =
            payload.completedAt && entry.recertificationPeriodMonths
              ? addMonths(payload.completedAt, entry.recertificationPeriodMonths)
              : undefined;
          documents.generateDocument(
            tenantId,
            actorId,
            {
              idempotencyKey: `enrollment:${enrollmentId}:${entry.templateId}:v1`,
              templateId: entry.templateId,
              sourceEntityType: 'enrollment',
              sourceEntityId: enrollmentId,
              documentType: CERTIFICATE_DOCUMENT_TYPE,
              ...(validUntil ? { validUntil } : {})
            },
            traceCtx
          );
        }
        this.auditService.write({
          tenantId,
          actorId,
          action: 'documents.enrollment_document_set_issued',
          entityType: 'learning.enrollment',
          entityId: enrollmentId,
          newValues: { count: autoIssueEntries.length },
          requestId: payload.requestId,
          correlationId: payload.correlationId
        });
      });
    } catch (error) {
      this.auditService.write({
        tenantId,
        actorId,
        action: 'documents.enrollment_document_set_failed',
        entityType: 'learning.enrollment',
        entityId: enrollmentId,
        newValues: {
          error: error instanceof Error ? error.message : String(error)
        },
        requestId: payload.requestId,
        correlationId: payload.correlationId
      });
    }
  }

  private async issueLegacyCertificate(payload: EnrollmentCompletedPayload): Promise<void> {
    const { tenantId, enrollmentId, groupId, groupCourseIds, actorId } = payload;
    const traceCtx = enrollmentTraceRequestContext(payload);
    try {
      await this.documentsRunner.runWithTenantDocuments(tenantId, async (documents) => {
        const resolved = documents.resolveAutoCertificateTemplateBinding(
          tenantId,
          groupId,
          groupCourseIds
        );
        if (!resolved) {
          this.auditService.write({
            tenantId,
            actorId,
            action: 'documents.enrollment_certificate_skipped',
            entityType: 'learning.enrollment',
            entityId: enrollmentId,
            newValues: { reason: 'no_matching_certificate_binding' },
            requestId: payload.requestId,
            correlationId: payload.correlationId
          });
          return;
        }
        documents.generateDocument(
          tenantId,
          actorId,
          {
            idempotencyKey: `enrollment:${enrollmentId}:${CERTIFICATE_DOCUMENT_TYPE}:v1`,
            templateId: resolved.templateId,
            sourceEntityType: 'enrollment',
            sourceEntityId: enrollmentId,
            documentType: CERTIFICATE_DOCUMENT_TYPE
          },
          traceCtx
        );
      });
    } catch (error) {
      this.auditService.write({
        tenantId,
        actorId,
        action: 'documents.enrollment_certificate_failed',
        entityType: 'learning.enrollment',
        entityId: enrollmentId,
        newValues: {
          error: error instanceof Error ? error.message : String(error)
        },
        requestId: payload.requestId,
        correlationId: payload.correlationId
      });
    }
  }
}
