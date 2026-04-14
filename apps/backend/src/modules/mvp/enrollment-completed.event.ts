export const ENROLLMENT_COMPLETED_EVENT = 'learning.enrollment_completed' as const;

export interface EnrollmentCompletedPayload {
  tenantId: string;
  enrollmentId: string;
  learnerId: string;
  groupId: string;
  groupCourseIds: string[];
  actorId?: string;
}
