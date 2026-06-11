import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ProctoringRetentionScanner } from './proctoring-retention-scanner.service.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

/** Stable advisory-lock key (reminders 528_491, identity 528_492 → proctoring 528_493). */
const PROCTORING_RETENTION_LOCK_KEY = 528_493;

@Injectable()
export class ProctoringRetentionSchedulerService {
  private readonly logger = new Logger(ProctoringRetentionSchedulerService.name);

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(ProctoringRetentionScanner) private readonly scanner: ProctoringRetentionScanner,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Cron(backendEnv.PROCTORING_RETENTION_CRON_SCHEDULE, {
    name: 'proctoring-video-retention',
    timeZone: 'UTC'
  })
  async handleDailyPurge(): Promise<void> {
    if (!backendEnv.PROCTORING_VIDEO_RETENTION_ENABLED) {
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    this.logger.log(`Starting proctoring video retention purge asOf=${asOf}`);
    try {
      await this.runPurgeAllTenants(asOf);
    } catch (err) {
      this.logger.error(
        `Proctoring retention purge failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Advisory lock (one instance wins) → per-tenant WRITE-mode purge; one tenant's failure never aborts the batch. */
  async runPurgeAllTenants(asOf: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [PROCTORING_RETENTION_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the proctoring retention lock; skipping.');
        return;
      }
      const tenantIds = await this.tenants.listActiveTenantIds();
      let totalPurged = 0;
      for (const tenantId of tenantIds) {
        try {
          // WRITE mode is mandatory: read-only runWithTenantState silently drops purgedAt
          // stamps → infinite re-delete loop (Plan A holistic-review CRITICAL).
          const purged = await this.mvpRunner.runWithTenantStateAndSave(tenantId, async (state) =>
            this.scanner.scanTenant(tenantId, asOf, state)
          );
          if (purged > 0) this.logger.log(`tenant=${tenantId} purged=${purged}`);
          totalPurged += purged;
        } catch (err) {
          this.logger.error(
            `Proctoring retention failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      this.logger.log(
        `Completed proctoring video retention purge tenants=${tenantIds.length} purged=${totalPurged}`
      );
    });
  }
}
