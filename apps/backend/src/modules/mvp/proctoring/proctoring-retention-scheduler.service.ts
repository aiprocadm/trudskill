import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ProctoringRetentionScanner } from './proctoring-retention-scanner.service.js';
import {
  declareScheduler,
  recordSchedulerRun
} from '../../../common/metrics/scheduler-heartbeat.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

/** Stable advisory-lock key (reminders 528_491, identity 528_492 → proctoring 528_493). */
/*
 * Свой ключ замка. Раньше здесь стоял 528_493 — тот же, что у закрытия просроченных попыток
 * (`expired-attempts.scheduler.service.ts`). Задачи блокировали друг друга: попытки идут
 * каждые пять минут, удаление видео — раз в сутки в 05:00, то есть в 05:00 они стартуют
 * вместе, и суточная задача могла проигрывать гонку КАЖДЫЙ раз. Замок неблокирующий, поэтому
 * проигравшая просто молча пропускала прогон — без ошибки и без следа в журнале.
 *
 * Цена ошибки здесь высокая: видеозаписи экзаменов содержат персональные данные и обязаны
 * удаляться по сроку хранения (152-ФЗ, ФТ-G6). Закреплено `scheduler-locks.isolation.test.ts`.
 *
 * Занятые ключи: 528_491 напоминания, 528_492 хранение подтверждений личности,
 * 528_493 просроченные попытки, 528_494 счета за аренду, 528_497 зависшие задачи,
 * 528_499 общая уборка по срокам, 528_501 миграции.
 */
const PROCTORING_RETENTION_LOCK_KEY = 528_495;

@Injectable()
export class ProctoringRetentionSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ProctoringRetentionSchedulerService.name);

  /**
   * Объявляем планировщик при старте (журнал 327): до этого отметка появлялась только
   * после первого прогона, и «не тот cron / не взялся замок / выключен» выглядели как
   * ОТСУТСТВИЕ метрики — тревогу на такое не напишешь.
   */
  onModuleInit(): void {
    declareScheduler('proctoring-video-retention', {
      expectedIntervalMs: 24 * 60 * 60 * 1000,
      enabled: backendEnv.PROCTORING_VIDEO_RETENTION_ENABLED
    });
  }

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
    /* UTC осознанно — по той же причине, что и в уборке фото подтверждения (журнал 301). */
    const asOf = new Date().toISOString().slice(0, 10);
    this.logger.log(`Starting proctoring video retention purge asOf=${asOf}`);
    try {
      await this.runPurgeAllTenants(asOf);
      // Отметка «отработал» (Фаза 6 Task 6): молчание планировщика дольше своего
      // интервала иначе неотличимо от «работы не было».
      recordSchedulerRun('proctoring-video-retention', 'ok', {
        expectedIntervalMs: 24 * 60 * 60 * 1000
      });
    } catch (err) {
      recordSchedulerRun('proctoring-video-retention', 'error', {
        expectedIntervalMs: 24 * 60 * 60 * 1000
      });
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
