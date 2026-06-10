import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { IdentityRetentionScanner } from './identity-retention-scanner.service.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

/** Stable advisory-lock key for the identity image purge (distinct from reminders 528_491). */
const IDENTITY_RETENTION_LOCK_KEY = 528_492;

@Injectable()
export class IdentityRetentionSchedulerService {
  private readonly logger = new Logger(IdentityRetentionSchedulerService.name);

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(IdentityRetentionScanner) private readonly scanner: IdentityRetentionScanner,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Cron(backendEnv.IDENTITY_RETENTION_CRON_SCHEDULE, {
    name: 'identity-image-retention',
    timeZone: 'UTC'
  })
  async handleDailyPurge(): Promise<void> {
    if (!backendEnv.IDENTITY_IMAGE_RETENTION_ENABLED) {
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    this.logger.log(`Starting identity image retention purge asOf=${asOf}`);
    try {
      await this.runPurgeAllTenants(asOf);
    } catch (err) {
      this.logger.error(
        `Identity retention purge failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Advisory lock (one instance wins) → per-tenant purge; one tenant's failure never aborts the batch. */
  async runPurgeAllTenants(asOf: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [IDENTITY_RETENTION_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the identity retention lock; skipping.');
        return;
      }
      const tenantIds = await this.tenants.listActiveTenantIds();
      let totalPurged = 0;
      for (const tenantId of tenantIds) {
        try {
          const purged = await this.mvpRunner.runWithTenantState(tenantId, async (state) => {
            return this.scanner.scanTenant(tenantId, asOf, state);
          });
          if (purged > 0) this.logger.log(`tenant=${tenantId} purged=${purged}`);
          totalPurged += purged;
        } catch (err) {
          this.logger.error(
            `Identity retention failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      this.logger.log(
        `Completed identity retention purge tenants=${tenantIds.length} purged=${totalPurged}`
      );
    });
  }
}
