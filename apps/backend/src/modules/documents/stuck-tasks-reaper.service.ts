import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { DocumentsEnqueueService } from './documents-enqueue.service.js';
import { declareScheduler, recordSchedulerRun } from '../../common/metrics/scheduler-heartbeat.js';
import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Реапер зависших задач (ФТ-I1, Фаза 6 Task 7).
 *
 * ЗАЧЕМ. Задача выпуска документа переходит в `running`, когда воркер берёт её в работу.
 * Если воркер в этот момент умирает (перезапуск контейнера, обрыв связи, OOM), задача
 * ОСТАЁТСЯ `running` навсегда: сообщение из очереди уже забрано, никто её не повторит,
 * и в интерфейсе она вечно «выполняется». Слушатель ждёт удостоверение, которого никто
 * не выпустит.
 *
 * ЧТО ДЕЛАЕМ. Раз в пять минут ищем задачи, висящие в `running` дольше порога, возвращаем
 * их в `queued` и заново публикуем job. Повторная публикация безопасна: воркер при старте
 * «захватывает» задачу и второй раз тот же документ не выпустит.
 *
 * ПРО ГОНКУ. Состояние документов хранится снимком (jsonb) и переписывается целиком в
 * конце HTTP-запроса. Поэтому теоретически параллельный запрос может затереть возврат
 * задачи в очередь. Это не страшно: следующий прогон реапера через пять минут заметит её
 * снова, а повторная публикация ничего не портит. Держать ради этого блокировку на всё
 * состояние центра было бы много хуже.
 */

/** Отдельный ключ блокировки, чтобы два экземпляра бэкенда не гребли одно и то же. */
const STUCK_TASKS_LOCK_KEY = 528_497;

interface StuckTaskRow {
  tenant_id: string;
  id: string;
  started_at: string | null;
}

@Injectable()
export class StuckTasksReaperService implements OnModuleInit {
  private readonly logger = new Logger(StuckTasksReaperService.name);

  /**
   * Объявляем планировщик при старте (журнал 327): до этого отметка появлялась только
   * после первого прогона, и «не тот cron / не взялся замок / выключен» выглядели как
   * ОТСУТСТВИЕ метрики — тревогу на такое не напишешь.
   */
  onModuleInit(): void {
    declareScheduler('stuck-document-tasks-reaper', {
      expectedIntervalMs: 5 * 60_000,
      enabled: backendEnv.DOCUMENT_TASK_REAPER_ENABLED
    });
  }

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(DocumentsEnqueueService) private readonly enqueue: DocumentsEnqueueService
  ) {}

  @Cron('*/5 * * * *', { name: 'stuck-document-tasks-reaper', timeZone: 'UTC' })
  async handleSweep(): Promise<void> {
    if (!backendEnv.DOCUMENT_TASK_REAPER_ENABLED) {
      return;
    }
    try {
      const revived = await this.runSweep();
      recordSchedulerRun('stuck-document-tasks-reaper', 'ok', { expectedIntervalMs: 5 * 60_000 });
      if (revived > 0) {
        this.logger.warn(`Returned ${revived} stuck document task(s) to the queue`);
      }
    } catch (err) {
      recordSchedulerRun('stuck-document-tasks-reaper', 'error', {
        expectedIntervalMs: 5 * 60_000
      });
      this.logger.error(
        `Stuck document tasks sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Возвращает число оживлённых задач.
   *
   * Порог берётся из окружения: пятнадцать минут — это «дольше, чем любой честный выпуск
   * документа», включая конвертацию в PDF и загрузку в хранилище.
   */
  async runSweep(): Promise<number> {
    const thresholdMinutes = backendEnv.DOCUMENT_TASK_STUCK_MINUTES;

    const stuck = await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [STUCK_TASKS_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the stuck-tasks lock; skipping.');
        return [];
      }

      /*
       * Задача считается зависшей, только если у неё ЕСТЬ отметка начала и та старше
       * порога. Задача в `running` без `startedAt` — это, скорее всего, чужой формат
       * данных, и трогать её вслепую опаснее, чем оставить: пусть будет видна в списке.
       */
      const rows = await this.db.query<StuckTaskRow>(
        `update documents.runtime_documents
            set data = (data - 'startedAt')
                       || jsonb_build_object(
                            'status', 'queued',
                            'revivedAt', to_jsonb(now()::text),
                            'reviveCount', to_jsonb(coalesce((data->>'reviveCount')::int, 0) + 1)
                          ),
                updated_at = now()
          where collection = 'tasks'
            and data->>'status' = 'running'
            and data->>'startedAt' is not null
            and (data->>'startedAt')::timestamptz < now() - ($1 || ' minutes')::interval
          returning tenant_id, id, data->>'startedAt' as started_at`,
        [String(thresholdMinutes)],
        client
      );
      return rows;
    });

    for (const row of stuck) {
      // Публикуем ПОСЛЕ фиксации транзакции: воркер не должен увидеть задачу раньше,
      // чем она стала `queued`.
      await this.enqueue.publishGenerationJob(row.tenant_id, row.id);
    }

    return stuck.length;
  }
}
