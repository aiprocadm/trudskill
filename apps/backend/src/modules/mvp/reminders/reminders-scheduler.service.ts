import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { CourseDeadlineScanner } from './course-deadline-scanner.service.js';
import { LicenseExpiryScanner } from './license-expiry-scanner.service.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';
import { RecertificationScanner } from '../recertification/recertification-scanner.service.js';

/** Stable advisory-lock key for the nightly reminders scan (single key, app-wide). */
const REMINDERS_SCAN_LOCK_KEY = 528_491;

@Injectable()
export class RemindersSchedulerService {
  private readonly logger = new Logger(RemindersSchedulerService.name);

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(RecertificationScanner) private readonly recertScanner: RecertificationScanner,
    @Inject(CourseDeadlineScanner) private readonly deadlineScanner: CourseDeadlineScanner,
    @Inject(LicenseExpiryScanner) private readonly licenseScanner: LicenseExpiryScanner,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Cron(backendEnv.RECERTIFICATION_CRON_SCHEDULE, { name: 'reminders-daily-scan', timeZone: 'UTC' })
  async handleDailyScan(): Promise<void> {
    if (!backendEnv.RECERTIFICATION_SCAN_ENABLED) {
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    this.logger.log(`Starting nightly reminders scan asOf=${asOf}`);
    try {
      await this.runScanAllTenants(asOf);
    } catch (err) {
      this.logger.error(
        `Nightly reminders scan failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Acquire a transaction-scoped advisory lock (one instance wins), enumerate active tenants,
   * and run the recert + course-deadline scans per tenant under the shared per-tenant lock.
   * Each tenant is isolated by try/catch so one failure never aborts the batch.
   */
  async runScanAllTenants(asOf: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [REMINDERS_SCAN_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the reminders scan lock; skipping.');
        return;
      }

      const tenantIds = await this.tenants.listActiveTenantIds();
      for (const tenantId of tenantIds) {
        try {
          await this.mvpRunner.runWithTenantState(tenantId, async (state) => {
            await this.recertScanner.scanTenant(tenantId, asOf, state);
            await this.deadlineScanner.scanTenant(tenantId, asOf, state);
            await this.licenseScanner.scanTenant(tenantId, asOf, state);
          });
        } catch (err) {
          this.logger.error(
            `Reminders scan failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    });
  }
}
