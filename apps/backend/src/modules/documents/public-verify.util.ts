import type { GeneratedDocumentEntity } from './documents.types.js';

/**
 * Публичный результат проверки документа по QR (Pillar A Plan C §5.8/§5.9).
 * Намеренно НЕ содержит tenantId и PII — отдаётся неаутентифицированному
 * пользователю/регулятору. Поля learnerFullName/programTitle/issuerName и т.п.
 * остаются опциональными для будущего caller-адаптера, но базовый билдер их не
 * заполняет (см. [[project-pillar-a-regulated-training]]).
 */
export interface PublicVerifyResult {
  status: 'valid' | 'revoked' | 'not_found';
  documentId?: string;
  documentNumber?: string;
  documentType?: string;
  issueDate?: string;
  /** Из source enrollment → mvp.learners. Резолвится caller'ом / адаптером (Plan C MVP — заглушка). */
  learnerFullName?: string;
  /** Из source enrollment → group → course → program meta. Caller adapter. */
  programTitle?: string;
  academicHours?: number;
  /** Краткое имя выдавшей организации (без tenant_id). */
  issuerName?: string;
  /** Заполнены только для status='revoked'. */
  revokedAt?: string;
  revocationReason?: string;
  /** Phase 6 — НЭП-подпись. Заполняется ТОЛЬКО для подписанных документов (сигнал доверия на странице проверки). */
  signatureStatus?: 'signed';
  signatureCertificateSubject?: string;
}

/**
 * Чистая проекция выпущенного документа в публичный результат проверки.
 * Источник истины для in-tenant пути (`DocumentsService.verifyDocumentByQrToken`)
 * и кросс-tenant публичного пути (`PublicVerifyController`) — чтобы оба отдавали
 * идентичную форму и одинаково не светили tenantId/PII/actor.
 */
export function buildPublicVerifyResult(doc: GeneratedDocumentEntity): PublicVerifyResult {
  const result: PublicVerifyResult = {
    status: doc.status === 'revoked' ? 'revoked' : 'valid',
    documentId: doc.id,
    documentType: doc.documentType
  };
  if (doc.documentNumber) result.documentNumber = doc.documentNumber;
  if (doc.documentDate) result.issueDate = doc.documentDate;
  if (doc.status === 'revoked') {
    if (doc.revokedAt) result.revokedAt = doc.revokedAt;
    if (doc.revocationReason) result.revocationReason = doc.revocationReason;
  }
  if (doc.signatureStatus === 'signed') {
    result.signatureStatus = 'signed';
    if (doc.signatureCertificateSubject)
      result.signatureCertificateSubject = doc.signatureCertificateSubject;
  }
  return result;
}
