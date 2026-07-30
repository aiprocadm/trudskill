import { Inject, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

export interface LegalLogEntryRow {
  id: string;
  tenantId: string;
  actorId?: string;
  entityType: string;
  entityId: string;
  eventType: string;
  description: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Чтение юридического журнала ИЗ БАЗЫ (ФТ-C2, Фаза 3 Task 9).
 *
 * До этого читателя не существовало вовсе: писатель (`LegalLogWriter`) появился в Task 3,
 * а `EsignService.listLegalLog` читает память. Для «личного дела» это не годится —
 * проверяющему нужна цепочка, пережившая перезапуск, а не то, что уцелело в процессе.
 *
 * Запросы идут по индексу `(tenant_id, entity_type, entity_id, created_at DESC)` из
 * миграции 0004; выборка по актору добавляет фильтр по `actor_id`.
 */
@Injectable()
export class LegalLogReader {
  private readonly logger = new Logger(LegalLogReader.name);

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Действия, подписанные конкретным пользователем.
   *
   * `limit` обязателен: журнал растёт бесконечно, и выгрузка всей истории в дело
   * превратила бы страницу в неподъёмную. Берём последние события — они и интересны.
   */
  async listByActor(tenantId: string, actorId: string, limit = 200): Promise<LegalLogEntryRow[]> {
    if (!actorId) return [];
    try {
      const rows = await this.db.query<{
        id: string;
        tenant_id: string;
        actor_id: string | null;
        entity_type: string;
        entity_id: string;
        event_type: string;
        description: string;
        payload: Record<string, unknown> | null;
        created_at: string;
      }>(
        `select id, tenant_id, actor_id, entity_type, entity_id, event_type, description, payload, created_at
         from esign.legal_log_entries
         where tenant_id = $1 and actor_id = $2
         order by created_at desc
         limit $3`,
        [tenantId, actorId, limit]
      );
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        ...(r.actor_id ? { actorId: r.actor_id } : {}),
        entityType: r.entity_type,
        entityId: r.entity_id,
        eventType: r.event_type,
        description: r.description,
        payload: r.payload ?? {},
        createdAt: r.created_at
      }));
    } catch (err) {
      /*
       * Недоступный журнал НЕ должен обрушить всё дело: остальные три раздела —
       * идентификация, экзамены, документы — по-прежнему полезны проверяющему.
       * Но и молча выдать пустой раздел нельзя: вызывающий помечает его как
       * «не удалось прочитать», чтобы отсутствие подписей не выглядело фактом.
       */
      this.logger.error(
        `Legal log read failed tenant=${tenantId} actor=${actorId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      throw err;
    }
  }
}
