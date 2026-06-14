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

/** Phase 9 Plan B — строка разбивки дашборда аналитики. */
export interface AnalyticsBreakdownRow {
  key: string;
  label: string;
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  completionRate: number;
  examPassRate: number;
  averageScorePercent: number | null;
}

export interface AnalyticsAttemptDistribution {
  passedFirstAttempt: number;
  passedSecondAttempt: number;
  passedThirdPlusAttempt: number;
}

export interface AnalyticsDashboardDto {
  scope: {
    courseId?: string;
    groupId?: string;
    clientId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  completionRate: number;
  examResultsTotal: number;
  examResultsPassed: number;
  examPassRate: number;
  averageCompletionDays: number | null;
  averageScorePercent: number | null;
  attemptDistribution: AnalyticsAttemptDistribution;
  dropOffCount: number;
  dropOffThresholdDays: number;
  byCourse: AnalyticsBreakdownRow[];
  byGroup: AnalyticsBreakdownRow[];
}

/** Phase 10 Track A — Excel report builder contracts. */
export type ReportEntityKey = 'learners' | 'enrollments';
export type ReportFieldType = 'string' | 'number' | 'date' | 'enum';

export interface ReportFieldMeta {
  key: string;
  header: string;
  type: string;
}

export interface ReportFilterMeta {
  key: string;
  label: string;
  kind: string;
  type: string;
}

export interface ReportEntityMetaDto {
  key: string;
  label: string;
  fields: ReportFieldMeta[];
  filters: ReportFilterMeta[];
}

export interface ReportEntitiesMetaDto {
  entities: ReportEntityMetaDto[];
}

export interface ReportFilterValue {
  key: string;
  value: string;
}

export interface BuildReportRequest {
  entityKey: ReportEntityKey;
  selectedFields: string[];
  filters?: ReportFilterValue[];
}

export interface ReportColumnDto {
  key: string;
  header: string;
  type: ReportFieldType;
}

export interface ReportPreviewResponse {
  columns: ReportColumnDto[];
  rows: Record<string, string | number | null>[];
  total: number;
  truncated: boolean;
}

export interface ReportExportResponse {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface ReportTemplateDto {
  id: string;
  tenantId: string;
  name: string;
  entityKey: ReportEntityKey;
  selectedFields: string[];
  filters: ReportFilterValue[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveReportTemplateRequest extends BuildReportRequest {
  id?: string;
  name: string;
}
