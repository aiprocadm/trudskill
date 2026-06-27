import type { GeneratedDocumentEntity } from '../documents.types.js';
import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';

export interface DocumentsPersistenceBackend {
  loadIntoState(tenantId: string, state: InMemoryDocumentsState): Promise<void>;
  saveFromState(tenantId: string, state: InMemoryDocumentsState): Promise<void>;
  /**
   * Кросс-tenant поиск выпущенного документа по публичному qrToken (128-бит, глобально
   * уникален). Нужен публичной QR-проверке: у неё нет ни tenant-контекста, ни
   * request-scoped state — она не может полагаться на per-tenant загрузку.
   */
  findGeneratedDocumentByQrToken(
    token: string
  ): Promise<{ tenantId: string; document: GeneratedDocumentEntity } | null>;
}
