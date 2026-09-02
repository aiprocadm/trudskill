import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ExpiredAttemptsScanner } from './expired-attempts.scanner.service.js';
import {
  declareScheduler,
  recordSchedulerRun
} from '../../../common/metrics/scheduler-heartbeat.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

/** Свой ключ advisory-лока (не пересекается с 528_491 reminders и 528_492 retention). */
const EXPIRED_ATTEMPTS_LOCK_KEY = 528_493;

/**
 * Регулярное закрытие истёкших попыток (ФТ-E2, Фаза 2 Task 12).
 *
 * Раз в 5 минут, а не раз в сутки: попытка с вышедшим временем занимает лимит попыток
 * слушателя и висит незавершённой в отчётах — ждать до ночи здесь незачем. Расписание
 * зашито литералом, чтобы не расширять схему env ради одной константы.
 *
 * Advisory-лок: при нескольких экземплярах приложения сканирование выполняет один;
 * сбой на одном тенанте не прерывает обход остальных.
 */
@Injectable()
export class ExpiredAttemptsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ExpiredAttemptsSchedulerService.name);

  /**
   * Объявляем планировщик при старте (журнал 327): до этого отметка появлялась только
   * после первого прогона, и «не тот cron / не взялся замок / выключен» выглядели как
   * ОТСУТСТВИЕ метрики — тревогу на такое не напишешь.
   */
  onModuleInit(): void {
    declareScheduler('expired-attempts-sweep', {
      expectedIntervalMs: 5 * 60 * 1000,
      enabled: true
    });
  }

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(ExpiredAttemptsScanner) private readonly scanner: ExpiredAttemptsScanner,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Cron('*/5 * * * *', { name: 'expired-attempts-sweep', timeZone: 'UTC' })
  async handleSweep(): Promise<void> {
    try {
      await this.runSweepAllTenants(new Date().toISOString());
      // Отметка «отработал» (Фаза 6 Task 6): молчание планировщика дольше своего
      // интервала иначе неотличимо от «работы не было».
      recordSchedulerRun('expired-attempts-sweep', 'ok', { expectedIntervalMs: 5 * 60 * 1000 });
    } catch (err) {
      recordSchedulerRun('expired-attempts-sweep', 'error', { expectedIntervalMs: 5 * 60 * 1000 });
      this.logger.error(
        `Expired attempts sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async runSweepAllTenants(asOf: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [EXPIRED_ATTEMPTS_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the expired-attempts lock; skipping.');
        return;
      }
      const tenantIds = await this.tenants.listActiveTenantIds();
      let totalClosed = 0;
      for (const tenantId of tenantIds) {
        try {
          const closed = await this.mvpRunner.runWithTenantStateAndSave(tenantId, async (state) =>
            this.scanner.scanTenant(tenantId, asOf, state)
          );
          totalClosed += closed;
        } catch (err) {
          this.logger.error(
            `Expired attempts sweep failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      if (totalClosed > 0) {
        this.logger.log(
          `Closed ${totalClosed} expired attempt(s) across ${tenantIds.length} tenant(s)`
        );
      }
    });
  }
}
