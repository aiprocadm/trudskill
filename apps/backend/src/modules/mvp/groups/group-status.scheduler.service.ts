import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { GroupStatusScanner } from './group-status.scanner.service.js';
import {
  declareScheduler,
  recordSchedulerRun
} from '../../../common/metrics/scheduler-heartbeat.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

/** Свой ключ advisory-лока: 528_491…497 и 499 заняты другими задачами (сторож `scheduler-locks`). */
const GROUP_STATUS_LOCK_KEY = 528_498;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ежедневный сканер статусов групп (МГ-B3.1; Фаза 2, срез 8.2). Выключен по умолчанию
 * (`GROUP_STATUS_SCAN_ENABLED`), расписание — `GROUP_STATUS_CRON_SCHEDULE` (UTC, 02:00 —
 * до ночного обхода напоминаний в 03:00, чтобы напоминания видели уже новые статусы).
 * Меняет снимок центра — поэтому идёт через `runWithTenantStateAndSave`; сбой на одном
 * центре не прерывает обход остальных; при нескольких экземплярах работает один.
 */
@Injectable()
export class GroupStatusSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(GroupStatusSchedulerService.name);

  onModuleInit(): void {
    declareScheduler('group-status-scan', {
      expectedIntervalMs: DAY_MS,
      enabled: backendEnv.GROUP_STATUS_SCAN_ENABLED
    });
  }

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(GroupStatusScanner) private readonly scanner: GroupStatusScanner,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Cron(backendEnv.GROUP_STATUS_CRON_SCHEDULE, { name: 'group-status-scan', timeZone: 'UTC' })
  async handleDailyScan(): Promise<void> {
    if (!backendEnv.GROUP_STATUS_SCAN_ENABLED) return;
    try {
      await this.runScanAllTenants(new Date().toISOString());
      recordSchedulerRun('group-status-scan', 'ok', { expectedIntervalMs: DAY_MS });
    } catch (err) {
      recordSchedulerRun('group-status-scan', 'error', { expectedIntervalMs: DAY_MS });
      this.logger.error(
        `Group status scan failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async runScanAllTenants(asOf: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [GROUP_STATUS_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the group-status lock; skipping.');
        return;
      }
      const tenantIds = await this.tenants.listActiveTenantIds();
      let total = 0;
      for (const tenantId of tenantIds) {
        try {
          total += await this.mvpRunner.runWithTenantStateAndSave(tenantId, async (state) =>
            this.scanner.scanTenant(tenantId, asOf, state)
          );
        } catch (err) {
          this.logger.error(
            `Group status scan failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      if (total > 0) {
        this.logger.log(`Moved ${total} group(s) across ${tenantIds.length} tenant(s)`);
      }
    });
  }
}
