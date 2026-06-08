import { Inject, Injectable } from '@nestjs/common';

import { PostgresDocumentsPersistenceBackend } from './postgres-documents-persistence.backend.js';

import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';
import type { DocumentsPersistenceBackend } from './documents-persistence.backend.js';

@Injectable()
export class DocumentsPersistenceRepositoryAdapter implements DocumentsPersistenceBackend {
  constructor(
    @Inject(PostgresDocumentsPersistenceBackend)
    private readonly backend: PostgresDocumentsPersistenceBackend
  ) {}

  async loadIntoState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    await this.backend.loadIntoState(tenantId, state);
  }

  async saveFromState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    await this.backend.saveFromState(tenantId, state);
  }
}
