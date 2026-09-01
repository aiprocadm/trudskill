import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { declareScheduler, recordSchedulerRun } from '../../common/metrics/scheduler-heartbeat.js';
import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Чистка разрастающихся таблиц (ФТ-I4, Фаза 6 Task 9).
 *
 * ЗАЧЕМ. Четыре таблицы росли без единой чистки — на стенде в них уже лежало 117 сессий,
 * из которых 15 просрочены и 20 отозваны, и ни одна никогда не удалялась. На работающем
 * центре это выглядит так: база пухнет, запросы к сессиям замедляются, а место на диске
 * (общем с бэкапами!) кончается — то есть чистка это не «уборка», а условие того, что
 * ночная копия вообще снимется.
 *
 * ЧТО ЧИСТИМ И ПОЧЕМУ ИМЕННО ТАК:
 *
 * 1. `iam.sessions` — просроченные и отозванные. НЕ сразу: отозванную сессию оставляем
 *    ещё на срок хранения, чтобы при разборе инцидента («кто и когда вошёл») было что
 *    посмотреть.
 * 2. `iam.magic_link_tokens` — использованные и протухшие ссылки входа. Живут минуты,
 *    хранить их дольше недели незачем, а это прямые персональные данные (адрес почты, IP).
 * 3. `core.processed_message_ids` — отметки «это сообщение уже обработано». ОПАСНОЕ место:
 *    удалить отметку раньше времени значит разрешить повторную обработку старого
 *    сообщения, то есть выпустить второе удостоверение. Поэтому срок хранения заведомо
 *    больше любого окна повторов (десять попыток с задержкой до пяти минут).
 * 4. `audit.audit_log` — ПО УМОЛЧАНИЮ НЕ ЧИСТИТСЯ. Журнал аудита нужен для проверок и
 *    разбирательств, и удалять его «на всякий случай» нельзя: срок хранения — решение
 *    владельца, а не разработчика. Включается явно, через `AUDIT_RETENTION_DAYS`.
 *
 * Удаляем ПОРЦИЯМИ: одиночный `delete` на сотнях тысяч строк держит блокировки и умеет
 * положить живую работу центра на минуты.
 */

/** Отдельный ключ блокировки: чистку ведёт только один экземпляр бэкенда. */
const RETENTION_LOCK_KEY = 528_499;

/** Порция удаления за один заход — компромисс между скоростью и длиной блокировки. */
const BATCH_SIZE = 5_000;

export interface RetentionSweepResult {
  sessions: number;
  magicLinkTokens: number;
  processedMessages: number;
  auditEntries: number;
}

@Injectable()
export class RetentionSweeperService implements OnModuleInit {
  private readonly logger = new Logger(RetentionSweeperService.name);

  /**
   * Объявляем планировщик при старте (журнал 327): до этого отметка появлялась только
   * после первого прогона, и «не тот cron / не взялся замок / выключен» выглядели как
   * ОТСУТСТВИЕ метрики — тревогу на такое не напишешь.
   */
  onModuleInit(): void {
    declareScheduler('retention-sweeper', {
      expectedIntervalMs: 24 * 60 * 60 * 1000,
      enabled: backendEnv.RETENTION_SWEEP_ENABLED
    });
  }

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Cron('40 3 * * *', { name: 'retention-sweeper', timeZone: 'UTC' })
  async handleSweep(): Promise<void> {
    if (!backendEnv.RETENTION_SWEEP_ENABLED) {
      return;
    }
    try {
      const result = await this.runSweep();
      recordSchedulerRun('retention-sweeper', 'ok', { expectedIntervalMs: 24 * 60 * 60 * 1000 });
      const total =
        result.sessions + result.magicLinkTokens + result.processedMessages + result.auditEntries;
      if (total > 0) {
        this.logger.log(
          `Retention sweep removed ${total} row(s): sessions=${result.sessions}, ` +
            `magicLinks=${result.magicLinkTokens}, processedMessages=${result.processedMessages}, ` +
            `audit=${result.auditEntries}`
        );
      }
    } catch (err) {
      recordSchedulerRun('retention-sweeper', 'error', {
        expectedIntervalMs: 24 * 60 * 60 * 1000
      });
      this.logger.error(
        `Retention sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async runSweep(): Promise<RetentionSweepResult> {
    const empty: RetentionSweepResult = {
      sessions: 0,
      magicLinkTokens: 0,
      processedMessages: 0,
      auditEntries: 0
    };

    const lockRows = await this.db.query<{ locked: boolean }>(
      'select pg_try_advisory_lock($1) as locked',
      [RETENTION_LOCK_KEY]
    );
    if (!lockRows[0]?.locked) {
      this.logger.log('Another instance holds the retention lock; skipping.');
      return empty;
    }

    try {
      const sessions = await this.deleteInBatches(
        `delete from iam.sessions
          where ctid in (
            select ctid from iam.sessions
             where (expires_at < now() - ($1 || ' days')::interval)
                or (revoked_at is not null and revoked_at < now() - ($1 || ' days')::interval)
             limit ${BATCH_SIZE}
          )`,
        [String(backendEnv.SESSION_RETENTION_DAYS)]
      );

      const magicLinkTokens = await this.deleteInBatches(
        `delete from iam.magic_link_tokens
          where ctid in (
            select ctid from iam.magic_link_tokens
             where created_at < now() - ($1 || ' days')::interval
               and (consumed_at is not null or expires_at < now())
             limit ${BATCH_SIZE}
          )`,
        [String(backendEnv.MAGIC_LINK_RETENTION_DAYS)]
      );

      const processedMessages = await this.deleteInBatches(
        `delete from core.processed_message_ids
          where ctid in (
            select ctid from core.processed_message_ids
             where processed_at < now() - ($1 || ' days')::interval
             limit ${BATCH_SIZE}
          )`,
        [String(backendEnv.PROCESSED_MESSAGE_RETENTION_DAYS)]
      );

      // Ноль = «хранить вечно». Это значение по умолчанию: удалять журнал аудита без
      // явного решения владельца нельзя.
      const auditEntries =
        backendEnv.AUDIT_RETENTION_DAYS > 0
          ? await this.deleteInBatches(
              `delete from audit.audit_log
                where ctid in (
                  select ctid from audit.audit_log
                   where created_at < now() - ($1 || ' days')::interval
                   limit ${BATCH_SIZE}
                )`,
              [String(backendEnv.AUDIT_RETENTION_DAYS)]
            )
          : 0;

      return { sessions, magicLinkTokens, processedMessages, auditEntries };
    } finally {
      await this.db.query('select pg_advisory_unlock($1)', [RETENTION_LOCK_KEY]);
    }
  }

  /**
   * Удаляет порциями, пока порции не кончатся.
   *
   * Предел на число заходов — предохранитель: если строка почему-то не удаляется
   * (например, её держит внешний ключ), цикл не должен крутиться вечно.
   */
  private async deleteInBatches(sql: string, params: unknown[]): Promise<number> {
    let removed = 0;
    for (let pass = 0; pass < 100; pass += 1) {
      const rows = await this.db.query<{ count: string }>(
        `with deleted as (${sql} returning 1) select count(*)::text as count from deleted`,
        params
      );
      const batch = Number(rows[0]?.count ?? 0);
      removed += batch;
      if (batch < BATCH_SIZE) {
        break;
      }
    }
    return removed;
  }
}
