import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { RentalBillingService } from './rental-billing.service.js';
import { declareScheduler, recordSchedulerRun } from '../../common/metrics/scheduler-heartbeat.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

/** Свой ключ advisory-лока (528_491 reminders, 528_492 retention, 528_493 attempts заняты). */
const RENTAL_BILLING_LOCK_KEY = 528_494;

/**
 * ФТ-D5.1: ежедневный обход просрочки аренды.
 *
 * Раз в сутки, а не раз в пять минут: grace измеряется рабочими днями, и приостановка
 * на несколько часов раньше или позже ничего не меняет — а вот лишние обходы по всем
 * счетам платформы стоят запросов. Время — раннее утро UTC, до рабочего дня в РФ:
 * приостановка должна случиться ДО того, как центр начнёт учить людей в этот день.
 *
 * Advisory-лок: при нескольких экземплярах приложения обход делает один.
 */
@Injectable()
export class RentalBillingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RentalBillingSchedulerService.name);

  /**
   * Объявляем планировщик при старте (журнал 327): до этого отметка появлялась только
   * после первого прогона, и «не тот cron / не взялся замок / выключен» выглядели как
   * ОТСУТСТВИЕ метрики — тревогу на такое не напишешь.
   */
  onModuleInit(): void {
    declareScheduler('rental-billing-overdue-sweep', {
      expectedIntervalMs: 24 * 60 * 60 * 1000,
      enabled: true
    });
  }

  constructor(
    @Inject(RentalBillingService) private readonly billing: RentalBillingService,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Cron('15 3 * * *', { name: 'rental-billing-overdue-sweep', timeZone: 'UTC' })
  async handleSweep(): Promise<void> {
    try {
      /*
       * Счета выставляет ПЛАТФОРМА, а не центр (журнал 301): календарь здесь
       * платформенный и общий для всех арендаторов. Считать просрочку в поясе
       * должника значило бы, что один и тот же день у разных центров наступает
       * в разное время — для денег это хуже, а не лучше.
       */
      await this.runSweep(new Date().toISOString().slice(0, 10));
      // Отметка «отработал» (Фаза 6 Task 6): молчание планировщика дольше своего
      // интервала иначе неотличимо от «работы не было».
      recordSchedulerRun('rental-billing-overdue-sweep', 'ok', {
        expectedIntervalMs: 24 * 60 * 60 * 1000
      });
    } catch (err) {
      recordSchedulerRun('rental-billing-overdue-sweep', 'error', {
        expectedIntervalMs: 24 * 60 * 60 * 1000
      });
      this.logger.error(
        `Rental billing sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async runSweep(today: string): Promise<number> {
    return this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [RENTAL_BILLING_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the rental-billing lock; skipping.');
        return 0;
      }
      const suspended = await this.billing.suspendOverdueTenants(today);
      if (suspended.length > 0) {
        this.logger.warn(`Suspended ${suspended.length} tenant(s) for non-payment.`);
      }
      return suspended.length;
    });
  }
}
