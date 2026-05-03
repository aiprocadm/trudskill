/** Ручное дополнение к generated-контрактам под новые MVP-метрики (BL-008) и массовые зачисления (BL-003). */

export interface KpiEnrollmentBreakdownRow {
  enrollmentId: string;
  learnerId: string;
  groupId: string;
  status: string;
  enrolledAt: string;
}

export interface KpiSnapshotDto {
  scope: {
    courseId?: string;
    groupId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  enrollmentCompletionRate: number;
  examResultsInScopeTotal: number;
  examResultsPassed: number;
  examPassRate: number;
  /** При запросе с `include_enrollment_breakdown=1`. */
  enrollmentBreakdown?: KpiEnrollmentBreakdownRow[];
}

/** Ответ POST enrollments/bulk при `deliveryMode: "queued"`. */
export interface BulkEnrollmentsQueuedDto {
  status: 'queued';
  messageId: string;
  idempotencyKey: string;
}

export interface BulkEnrollmentItemErrorDto {
  learnerId: string;
  code: string;
  message: string;
}

export interface BulkEnrollmentsOutcomeDto {
  idempotencyKey: string;
  groupId: string;
  created: unknown[];
  skippedExisting: Array<{ learnerId: string; enrollmentId: string }>;
  errors: BulkEnrollmentItemErrorDto[];
}
