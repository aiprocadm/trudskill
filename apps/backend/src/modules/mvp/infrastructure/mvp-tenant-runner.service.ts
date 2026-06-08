import { Inject, Injectable } from '@nestjs/common';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { MVP_PERSISTENCE_BACKEND } from './mvp-persistence.token.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';

import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';

/**
 * Runs read-only MVP-state work outside an HTTP request (e.g. the nightly reminders cron):
 * load tenant state → fn(state), under the shared per-tenant lock. Intentionally does NOT
 * save — callers must not mutate the state (drafts/emails persist in their own stores).
 */
@Injectable()
export class MvpTenantRunner {
  constructor(
    @Inject(MVP_PERSISTENCE_BACKEND)
    private readonly persistence: MvpPersistenceBackend,
    private readonly tenantGateway: TenantSerialGateway
  ) {}

  async runWithTenantState<R>(
    tenantId: string,
    fn: (state: InMemoryMvpState) => Promise<R>
  ): Promise<R> {
    return this.tenantGateway.runExclusive(tenantId, async () => {
      const state = new InMemoryMvpState();
      await this.persistence.loadIntoState(tenantId, state);
      return fn(state);
    });
  }
}
