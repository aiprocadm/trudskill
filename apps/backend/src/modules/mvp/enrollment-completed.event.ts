export const ENROLLMENT_COMPLETED_EVENT = 'learning.enrollment_completed' as const;

export interface EnrollmentCompletedPayload {
  tenantId: string;
  enrollmentId: string;
  learnerId: string;
  groupId: string;
  groupCourseIds: string[];
  actorId?: string;
  /** HTTP `RequestContext.requestId`, если переход статуса инициирован запросом API */
  requestId?: string;
  /** HTTP `RequestContext.correlationId` (заголовок `x-correlation-id` и др.) */
  correlationId?: string;
}
