export const ENROLLMENT_COMPLETED_EVENT = 'learning.enrollment_completed' as const;

/**
 * Запись из `learning.course_document_sets`, разрешённая на момент завершения
 * зачисления. Producer (MvpService) резолвит её из state, чтобы листенер не
 * нуждался в обратном DI-порте в mvp module (Plan A §5.3).
 */
export interface EnrollmentCompletedDocumentSetEntry {
  courseVersionId: string;
  templateId: string;
  position: number;
  isRequired: boolean;
  autoIssueOnCompletion: boolean;
  /** Phase 5B — program validity (months) for this course version; undefined = бессрочно. */
  recertificationPeriodMonths?: number;
}

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
  /**
   * Резолвленный пакет выходных документов из всех `course_versions` группы (Plan A §5.3).
   * Пустой массив (или undefined для совместимости) — нет per-course конфигурации,
   * листенер вернётся к legacy single-cert flow через `resolveAutoCertificateTemplateBinding`.
   */
  documentSet?: EnrollmentCompletedDocumentSetEntry[];
  /** Resolved learner contact for Phase 5 email (producer-resolved, spec §3.1). */
  recipient?: { email: string; name?: string; userId?: string };
  /** Phase 5B — enrollment completion timestamp, for valid_until stamping. */
  completedAt?: string;
  /** Phase 5B — resolved group/course title (filled by a later task; keep optional). */
  courseTitle?: string;
}
