import type { ConsentKind, ConsentSource } from './consent.js';

export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');

export interface ConsentDocumentRow {
  tenantId: string;
  kind: ConsentKind;
  version: number;
  body: string;
  bodyHash: string;
  createdAt: string;
}

export interface ConsentFactRow {
  id: string;
  tenantId: string;
  learnerId: string;
  kind: ConsentKind;
  /** Пусто у согласий, перенесённых миграцией 0069: текста тогда не существовало. */
  documentVersion?: number;
  bodyHash?: string;
  grantedAt: string;
  revokedAt?: string;
  ip?: string;
  userAgent?: string;
  /* МГ-C5.1 (0115): источник, кто отметил, скан из личного дела. */
  source?: ConsentSource;
  actorUserId?: string;
  evidenceFileId?: string;
}

export interface ConsentRepository {
  /** Действующая (последняя) версия текста согласия данного вида. */
  findCurrentDocument(tenantId: string, kind: ConsentKind): Promise<ConsentDocumentRow | null>;
  /** Новая версия текста; старые не переписываются — под ними уже подписались. */
  insertDocument(
    tenantId: string,
    kind: ConsentKind,
    body: string,
    bodyHash: string
  ): Promise<ConsentDocumentRow>;
  /** Последний по времени факт согласия данного вида (может быть отозванным). */
  findLatestFact(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind
  ): Promise<ConsentFactRow | null>;
  /**
   * `grantedAt` задаётся ТОЛЬКО при переносе исторического согласия: дата должна остаться
   * той, когда человек согласие дал, а не той, когда мы это заметили.
   */
  insertFact(
    input: Omit<ConsentFactRow, 'id' | 'grantedAt'> & { grantedAt?: string }
  ): Promise<ConsentFactRow>;
  /** Отзыв последнего действующего согласия. `null`, если отзывать нечего. */
  revokeLatestFact(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind,
    revokedAt: string
  ): Promise<ConsentFactRow | null>;
}
