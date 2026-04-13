import { Injectable } from '@nestjs/common';

import { MVP_COLLECTIONS, type MvpCollection } from './mvp-collections.js';

import type { InMemoryMvpState } from './in-memory-mvp.state.js';
import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';

type Snapshot = Record<MvpCollection, unknown[]>;

@Injectable()
export class MemoryMvpPersistenceBackend implements MvpPersistenceBackend {
  private readonly snapshots = new Map<string, Snapshot>();

  async loadIntoState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    const snap = this.snapshots.get(tenantId);
    for (const col of MVP_COLLECTIONS) {
      const target = this.pick(state, col);
      target.length = 0;
      if (snap?.[col]?.length) target.push(...snap[col]);
    }
  }

  async saveFromState(tenantId: string, state: InMemoryMvpState): Promise<void> {
    const snap = {} as Snapshot;
    for (const col of MVP_COLLECTIONS) {
      snap[col] = [...this.pick(state, col)];
    }
    this.snapshots.set(tenantId, snap);
  }

  private pick(state: InMemoryMvpState, col: MvpCollection): unknown[] {
    return (state as unknown as Record<MvpCollection, unknown[]>)[col];
  }
}
