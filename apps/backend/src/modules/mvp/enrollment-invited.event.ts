export const ENROLLMENT_INVITED_EVENT = 'learning.enrollment_invited' as const;

export interface EnrollmentInvitedPayload {
  tenantId: string;
  enrollmentId: string;
  learnerId: string;
  groupId: string;
  /** Resolved learner contact; absent if the learner has no e-mail on file. */
  recipient?: { email: string; name?: string };
  /** Phase 5B — resolved group/course title for the email subject. */
  courseTitle?: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
}
