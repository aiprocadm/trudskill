/**
 * Phase 1 §4.3 — DTO зеркало backend LearnerDocumentDto (mvp.service.ts).
 * Документ, выданный учащемуся по завершению курса.
 */
export interface LearnerDocument {
  id: string;
  documentType: string;
  name: string;
  documentNumber?: string;
  documentDate?: string;
  status: string;
  qrToken?: string;
  enrollmentId: string;
  courseId?: string;
  courseTitle: string;
  /** Пустая строка до Phase 5 (см. isDownloadable). */
  downloadUrl: string;
  isDownloadable: boolean;
  revocationReason?: string;
  replacedByDocumentId?: string;
}

export interface LearnerDocumentsResponse {
  items: LearnerDocument[];
}
