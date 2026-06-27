import { Injectable } from '@nestjs/common';

import {
  DOCUMENTS_ARRAY_COLLECTIONS,
  type DocumentsArrayCollection
} from './documents-collections.js';

import type { GeneratedDocumentEntity } from '../documents.types.js';
import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';
import type { DocumentsPersistenceBackend } from './documents-persistence.backend.js';

type Snapshot = {
  arrays: Record<DocumentsArrayCollection, unknown[]>;
  idemEntries: [string, { taskId: string; expiresAt: number }][];
};

@Injectable()
export class MemoryDocumentsPersistenceBackend implements DocumentsPersistenceBackend {
  private readonly snapshots = new Map<string, Snapshot>();

  async loadIntoState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    const snap = this.snapshots.get(tenantId);
    for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
      const target = this.pick(state, col);
      target.length = 0;
      if (snap?.arrays[col]?.length) target.push(...snap.arrays[col]);
    }
    state.idem.clear();
    if (snap?.idemEntries) {
      for (const [k, v] of snap.idemEntries) state.idem.set(k, v);
    }
  }

  async saveFromState(tenantId: string, state: InMemoryDocumentsState): Promise<void> {
    const arrays = {} as Record<DocumentsArrayCollection, unknown[]>;
    for (const col of DOCUMENTS_ARRAY_COLLECTIONS) {
      arrays[col] = [...this.pick(state, col)];
    }
    this.snapshots.set(tenantId, {
      arrays,
      idemEntries: Array.from(state.idem.entries())
    });
  }

  async findGeneratedDocumentByQrToken(
    token: string
  ): Promise<{ tenantId: string; document: GeneratedDocumentEntity } | null> {
    if (!token) return null;
    for (const [tenantId, snap] of this.snapshots) {
      const docs = snap.arrays.generatedDocuments as GeneratedDocumentEntity[] | undefined;
      const document = docs?.find((d) => d?.qrToken === token);
      if (document) return { tenantId, document };
    }
    return null;
  }

  private pick(state: InMemoryDocumentsState, col: DocumentsArrayCollection): unknown[] {
    return (state as unknown as Record<DocumentsArrayCollection, unknown[]>)[col];
  }
}
