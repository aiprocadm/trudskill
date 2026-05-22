import type { Course, Enrollment, Progress } from '../mvp/types';

export interface EnrollmentWithDetails {
  enrollment: Enrollment;
  course: Course | null;
  progress: Progress[];
}

export interface MyCourseSummary {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  status: Enrollment['status'];
  progressPercent: number;
  enrolledAt: string;
}

export type NextStepKind = 'continue' | 'start' | 'completed_all' | 'awaiting_assignment';

export interface NextStep {
  kind: NextStepKind;
  courseId?: string;
  courseTitle?: string;
  moduleId?: string;
  materialId?: string;
  href: string;
  cta: string;
  headline: string;
  description?: string;
}

export type LearnerRoleCode = 'learner' | 'teacher' | 'tenant_admin' | 'platform_admin';

export interface RoleOption {
  code: LearnerRoleCode;
  label: string;
  href: string;
}
