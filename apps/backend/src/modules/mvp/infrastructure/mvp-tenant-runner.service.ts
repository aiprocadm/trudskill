import { Inject, Injectable } from '@nestjs/common';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { MVP_PERSISTENCE_BACKEND } from './mvp-persistence.token.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';
import { TenantTimezoneService } from '../../../infrastructure/tenant/tenant-timezone.service.js';

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
    @Inject(TenantSerialGateway)
    private readonly tenantGateway: TenantSerialGateway,
    // Пояс центра — ПОСЛЕДНИМ аргументом: тесты собирают бегунок позиционно.
    @Inject(TenantTimezoneService)
    private readonly timezones: TenantTimezoneService
  ) {}

  async runWithTenantState<R>(
    tenantId: string,
    fn: (state: InMemoryMvpState) => Promise<R>
  ): Promise<R> {
    return this.tenantGateway.runExclusive(tenantId, async () => {
      const state = new InMemoryMvpState();
      // Календарные даты считаются в поясе ЦЕНТРА (журнал 301).
      state.tenantTimezone = await this.timezones.resolve(tenantId);
      await this.persistence.loadIntoState(tenantId, state);
      return fn(state);
    });
  }

  /**
   * Write-mode variant: loads tenant state, runs fn, and ALWAYS persists the state
   * afterwards (mirrors DocumentsTenantRunner). Use when fn mutates state outside a
   * request (e.g. the identity image retention cron). Runs under the same per-tenant
   * serial lock as HTTP requests.
   *
   * Save happens in a `finally` block so partial purge progress is never lost:
   * stamps are only set on individual records AFTER their files are successfully
   * deleted, so saving even on unexpected throw preserves all completed stamps and
   * lets idempotent retry skip already-purged records on the next run.
   */
  async runWithTenantStateAndSave<R>(
    tenantId: string,
    fn: (state: InMemoryMvpState) => Promise<R>
  ): Promise<R> {
    return this.tenantGateway.runExclusive(tenantId, async () => {
      const state = new InMemoryMvpState();
      // Календарные даты считаются в поясе ЦЕНТРА (журнал 301).
      state.tenantTimezone = await this.timezones.resolve(tenantId);
      await this.persistence.loadIntoState(tenantId, state);
      try {
        return await fn(state);
      } finally {
        await this.persistence.saveFromState(tenantId, state);
      }
    });
  }
}
