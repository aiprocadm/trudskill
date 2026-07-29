export const SIMPLE_SIGNATURE_REPOSITORY = Symbol('SIMPLE_SIGNATURE_REPOSITORY');

export interface AgreementRow {
  tenantId: string;
  version: number;
  body: string;
  bodyHash: string;
  createdAt: string;
}

export interface AcceptanceRow {
  id: string;
  tenantId: string;
  userId: string;
  agreementVersion: number;
  bodyHash: string;
  acceptedAt: string;
  ip?: string;
  userAgent?: string;
}

export interface SimpleSignatureRepository {
  /** Действующая (последняя) версия соглашения тенанта. */
  findCurrentAgreement(tenantId: string): Promise<AgreementRow | null>;
  /** Сохранение НОВОЙ версии; старые не переписываются — они уже подписаны. */
  insertAgreement(tenantId: string, body: string, bodyHash: string): Promise<AgreementRow>;
  /** Последнее принятие пользователя. */
  findLatestAcceptance(tenantId: string, userId: string): Promise<AcceptanceRow | null>;
  /** Идемпотентно: повторное принятие той же версии возвращает существующую запись. */
  insertAcceptance(input: Omit<AcceptanceRow, 'id' | 'acceptedAt'>): Promise<AcceptanceRow>;
}
