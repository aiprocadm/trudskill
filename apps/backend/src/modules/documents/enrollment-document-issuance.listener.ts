import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  ENROLLMENT_COMPLETED_EVENT,
  type EnrollmentCompletedPayload
} from '../mvp/enrollment-completed.event.js';

@Injectable()
export class EnrollmentDocumentIssuanceListener {
  private readonly logger = new Logger(EnrollmentDocumentIssuanceListener.name);

  @OnEvent(ENROLLMENT_COMPLETED_EVENT)
  async handleEnrollmentCompleted(payload: EnrollmentCompletedPayload): Promise<void> {
    this.logger.debug(
      `Enrollment completed event received for tenant=${payload.tenantId}, enrollment=${payload.enrollmentId}`
    );
  }
}
