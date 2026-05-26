/**
 * Pillar A Plan C §5.11 — DTO для агрегата карточки ученика.
 * Зеркало backend LearnerPdfCardAggregate.
 */

export interface LearnerPdfCardEnrollment {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  courseVersionId: string;
  academicHours?: number;
  trainingType?: string;
  enrolledAt: string;
  completedAt?: string;
  status: string;
}

export interface LearnerPdfCardDocument {
  id: string;
  documentNumber?: string;
  documentDate?: string;
  documentType: string;
  status: string;
}

export interface LearnerPdfCardAggregate {
  learner: {
    id: string;
    learnerNo?: string;
    fullName: string;
    snils?: string;
    position?: string;
    email?: string;
  };
  enrollments: LearnerPdfCardEnrollment[];
  documents: LearnerPdfCardDocument[];
}
