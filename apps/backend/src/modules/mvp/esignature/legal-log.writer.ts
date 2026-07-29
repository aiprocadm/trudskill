import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Запись в юридический журнал (ФТ-C1.1, Фаза 3 Task 3).
 *
 * **Находка при реализации.** Таблица `esign.legal_log_entries` существует с миграции
 * `0004` и защищена триггером от изменений (append-only), но `EsignService` пишет
 * записи ТОЛЬКО в память (`InMemoryEsignState.legalLogEntries`) — в базу не попадает
 * ничего. То есть журнал, на который опирается юридическая значимость, не переживает
 * перезапуск приложения. Для «личного дела» (Task 9) это критично: доказательная
 * цепочка обязана быть в БД.
 *
 * Поэтому ПЭП-события пишутся НАПРЯМУЮ в существующую таблицу — второго журнала не
 * заводим, как и требует план фазы. Приведение остальных событий `EsignService` к
 * durable-записи — отдельная задача, зафиксирована в handoff.
 */
@Injectable()
export class LegalLogWriter {
  private readonly logger = new Logger(LegalLogWriter.name);

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async write(entry: {
    tenantId: string;
    actorId?: string | undefined;
    entityType: string;
    entityId: string;
    eventType: string;
    description: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.db.query(
        `insert into esign.legal_log_entries
           (id, tenant_id, actor_id, entity_type, entity_id, event_type, description, payload)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          `eslegal_${randomUUID()}`,
          entry.tenantId,
          entry.actorId ?? null,
          entry.entityType,
          entry.entityId,
          entry.eventType,
          entry.description,
          JSON.stringify(entry.payload ?? {})
        ]
      );
    } catch (err) {
      // Журнал не должен ронять пользовательское действие, но молчать тоже нельзя:
      // пропавшая запись — это дыра в доказательной цепочке, и её надо увидеть в логах.
      this.logger.error(
        `Legal log write failed tenant=${entry.tenantId} event=${entry.eventType}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
}
