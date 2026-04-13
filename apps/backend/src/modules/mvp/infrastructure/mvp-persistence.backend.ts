import type { InMemoryMvpState } from './in-memory-mvp.state.js';

export interface MvpPersistenceBackend {
  loadIntoState(tenantId: string, state: InMemoryMvpState): Promise<void>;
  saveFromState(tenantId: string, state: InMemoryMvpState): Promise<void>;
}
