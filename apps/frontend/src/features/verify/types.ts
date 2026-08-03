/**
 * Pillar A Plan C §5.8 — public verify response DTO.
 * Mirror PublicVerifyResult из backend, без tenantId.
 */
export type VerifyStatus = 'valid' | 'revoked';

export interface VerifyResult {
  status: VerifyStatus;
  documentId?: string;
  documentNumber?: string;
  documentType?: string;
  issueDate?: string;
  learnerFullName?: string;
  programTitle?: string;
  academicHours?: number;
  issuerName?: string;
  /** ФТ-D3.1: бренд выдавшего центра (white-label) на публичной странице. */
  issuerLogoUrl?: string;
  issuerBrandColor?: string;
  revokedAt?: string;
  revocationReason?: string;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  certificate: 'Удостоверение',
  protocol: 'Протокол',
  order: 'Приказ',
  diploma: 'Диплом',
  attestation: 'Свидетельство об аттестации',
  reference: 'Справка',
  report: 'Отчёт',
  contract: 'Договор'
};
