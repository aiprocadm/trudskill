import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { type DocumentsTenantRunner } from './documents-tenant-runner.service.js';
import { type AuditService } from '../audit/audit.service.js';
import {
  ENROLLMENT_COMPLETED_EVENT,
  type EnrollmentCompletedPayload
} from '../mvp/enrollment-completed.event.js';

const CERTIFICATE_DOCUMENT_TYPE = 'certificate';

@Injectable()
export class EnrollmentDocumentIssuanceListener {
  constructor(
    private readonly documentsRunner: DocumentsTenantRunner,
    private readonly auditService: AuditService
  ) {}

  @OnEvent(ENROLLMENT_COMPLETED_EVENT, { async: true })
  handleEnrollmentCompleted(payload: EnrollmentCompletedPayload): void {
    setImmediate(() => {
      void this.issueCertificate(payload);
    });
  }

  private async issueCertificate(payload: EnrollmentCompletedPayload): Promise<void> {
    const { tenantId, enrollmentId, groupId, groupCourseIds, actorId } = payload;
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
            newValues: { reason: 'no_matching_certificate_binding' }
          });
          return;
        }
        documents.generateDocument(tenantId, actorId, {
          idempotencyKey: `enrollment:${enrollmentId}:${CERTIFICATE_DOCUMENT_TYPE}:v1`,
          templateId: resolved.templateId,
          sourceEntityType: 'enrollment',
          sourceEntityId: enrollmentId,
          documentType: CERTIFICATE_DOCUMENT_TYPE
        });
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
        }
      });
    }
  }
}
