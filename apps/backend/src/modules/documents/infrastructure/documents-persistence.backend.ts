import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';

export interface DocumentsPersistenceBackend {
  loadIntoState(tenantId: string, state: InMemoryDocumentsState): Promise<void>;
  saveFromState(tenantId: string, state: InMemoryDocumentsState): Promise<void>;
}
