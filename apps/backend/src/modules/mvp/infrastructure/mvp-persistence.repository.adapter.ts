import { Inject, Injectable } from '@nestjs/common';

import { PostgresMvpPersistenceBackend } from './postgres-mvp-persistence.backend.js';

import type { InMemoryMvpState } from './in-memory-mvp.state.js';
import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';

@Injectable()
export class MvpPersistenceRepositoryAdapter implements MvpPersistenceBackend {
  constructor(
    @Inject(PostgresMvpPersistenceBackend) private readonly backend: PostgresMvpPersistenceBackend
  ) {}

  async loadIntoState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    await this.backend.loadIntoState(tenantId, state);
  }

  async saveFromState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    await this.backend.saveFromState(tenantId, state);
  }
}
