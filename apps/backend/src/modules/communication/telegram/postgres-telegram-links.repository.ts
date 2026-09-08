import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { TelegramLink, TelegramLinksRepository } from './telegram-links.repository.js';

interface Row {
  tenant_id: string;
  user_id: string;
  chat_id: string;
  linked_at: string;
}

const toLink = (row: Row): TelegramLink => ({
  tenantId: row.tenant_id,
  userId: row.user_id,
  chatId: row.chat_id,
  linkedAt: row.linked_at
});

@Injectable()
export class PostgresTelegramLinksRepository implements TelegramLinksRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async findByUser(tenantId: string, userId: string): Promise<TelegramLink | null> {
    const rows = await this.db.query<Row>(
      `select tenant_id, user_id, chat_id, linked_at from communication.telegram_links
       where tenant_id = $1 and user_id = $2`,
      [tenantId, userId]
    );
    return rows[0] ? toLink(rows[0]) : null;
  }

  async findByChat(chatId: string): Promise<TelegramLink | null> {
    const rows = await this.db.query<Row>(
      `select tenant_id, user_id, chat_id, linked_at from communication.telegram_links
       where chat_id = $1`,
      [chatId]
    );
    return rows[0] ? toLink(rows[0]) : null;
  }

  /**
   * Привязка идёт ОДНОЙ транзакцией и снимает обе прежние связи: и чужую по этому чату, и
   * прежнюю по этому человеку. Порознь между ними умещается сбой — и остаётся состояние, где
   * чат уже отвязан от прошлого владельца, но не привязан к новому: уведомления пропадают
   * молча. Полагаться на ограничение уникальности мало: оно бы просто отвергло запись.
   */
  async link(tenantId: string, userId: string, chatId: string): Promise<TelegramLink> {
    return this.db.withTransaction(async (client) => {
      await client.query('delete from communication.telegram_links where chat_id = $1', [chatId]);
      await client.query(
        'delete from communication.telegram_links where tenant_id = $1 and user_id = $2',
        [tenantId, userId]
      );
      const inserted = await client.query<Row>(
        `insert into communication.telegram_links (id, tenant_id, user_id, chat_id)
         values ($1, $2, $3, $4)
         returning tenant_id, user_id, chat_id, linked_at`,
        [`tglink_${Math.random().toString(36).slice(2, 10)}`, tenantId, userId, chatId]
      );
      return toLink(inserted.rows[0]!);
    });
  }

  async unlink(tenantId: string, userId: string): Promise<void> {
    await this.db.query(
      'delete from communication.telegram_links where tenant_id = $1 and user_id = $2',
      [tenantId, userId]
    );
  }
}
