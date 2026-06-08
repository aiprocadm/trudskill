import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type { ChatDialogsQuery, ChatMessagesQuery, ChatRepository } from './chat.repository.js';
import type { ChatDialogRow, ChatMessageRow, ChatParticipantRow } from './in-memory-chat.state.js';

@Injectable()
export class PostgresChatRepository implements ChatRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listDialogs(tenantId: string, userId: string | undefined, query: ChatDialogsQuery = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const rows = await this.db.query<{
      id: string;
      tenant_id: string;
      dialog_type: ChatDialogRow['type'];
      related_entity_type: string | null;
      related_entity_id: string | null;
      assigned_user_id: string | null;
      created_at: string;
      updated_at: string;
      total_count: string;
    }>(
      `select d.id, d.tenant_id, d.dialog_type, d.related_entity_type, d.related_entity_id, d.assigned_user_id, d.created_at, d.updated_at,
              count(*) over()::text as total_count
       from communication.chat_dialogs d
       join communication.chat_participants p on p.dialog_id = d.id and p.tenant_id = d.tenant_id
       where d.tenant_id = $1 and p.user_id = $2
       order by d.updated_at ${query.sort === 'updatedAt:asc' ? 'asc' : 'desc'}
       limit $3 offset $4`,
      [tenantId, userId ?? '', pageSize, offset]
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        type: row.dialog_type,
        relatedEntityType: row.related_entity_type ?? undefined,
        relatedEntityId: row.related_entity_id ?? undefined,
        assignedUserId: row.assigned_user_id ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      total: Number(rows[0]?.total_count ?? 0)
    };
  }

  async createDialog(dialog: ChatDialogRow, participants: ChatParticipantRow[]) {
    await this.db.withTransaction(async (client) => {
      await client.query(
        `insert into communication.chat_dialogs
         (id, tenant_id, dialog_type, related_entity_type, related_entity_id, assigned_user_id, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)`,
        [
          dialog.id,
          dialog.tenantId,
          dialog.type,
          dialog.relatedEntityType ?? null,
          dialog.relatedEntityId ?? null,
          dialog.assignedUserId ?? null,
          dialog.createdAt,
          dialog.updatedAt
        ]
      );
      for (const participant of participants) {
        await client.query(
          `insert into communication.chat_participants
           (id, tenant_id, dialog_id, user_id, participant_role, unread_count)
           values ($1,$2,$3,$4,$5,$6)`,
          [
            `cp_${Math.random().toString(36).slice(2, 10)}`,
            participant.tenantId,
            participant.dialogId,
            participant.userId,
            participant.role,
            participant.unreadCount
          ]
        );
      }
    });
  }

  async getDialog(tenantId: string, dialogId: string) {
    const rows = await this.db.query<{
      id: string;
      tenant_id: string;
      dialog_type: ChatDialogRow['type'];
      related_entity_type: string | null;
      related_entity_id: string | null;
      assigned_user_id: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `select id, tenant_id, dialog_type, related_entity_type, related_entity_id, assigned_user_id, created_at, updated_at
       from communication.chat_dialogs where tenant_id = $1 and id = $2`,
      [tenantId, dialogId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      type: row.dialog_type,
      relatedEntityType: row.related_entity_type ?? undefined,
      relatedEntityId: row.related_entity_id ?? undefined,
      assignedUserId: row.assigned_user_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async isParticipant(tenantId: string, dialogId: string, userId: string | undefined) {
    const rows = await this.db.query<{ exists: boolean }>(
      'select exists(select 1 from communication.chat_participants where tenant_id = $1 and dialog_id = $2 and user_id = $3) as exists',
      [tenantId, dialogId, userId ?? '']
    );
    return rows[0]?.exists ?? false;
  }

  async listMessages(tenantId: string, dialogId: string, query: ChatMessagesQuery = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const rows = await this.db.query<{
      id: string;
      dialog_id: string;
      tenant_id: string;
      sender_user_id: string;
      message_type: ChatMessageRow['messageType'];
      text_body: string;
      sent_at: string;
      edited_at: string | null;
      deleted_at: string | null;
      total_count: string;
    }>(
      `select id, dialog_id, tenant_id, sender_user_id, message_type, text_body, sent_at, edited_at, deleted_at,
              count(*) over()::text as total_count
       from communication.chat_messages
       where tenant_id = $1 and dialog_id = $2
       order by sent_at ${query.sort === 'sentAt:asc' ? 'asc' : 'desc'}
       limit $3 offset $4`,
      [tenantId, dialogId, pageSize, offset]
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        dialogId: row.dialog_id,
        tenantId: row.tenant_id,
        senderUserId: row.sender_user_id,
        messageType: row.message_type,
        textBody: row.text_body,
        sentAt: row.sent_at,
        editedAt: row.edited_at ?? undefined,
        deletedAt: row.deleted_at ?? undefined
      })),
      total: Number(rows[0]?.total_count ?? 0)
    };
  }

  async createMessage(message: ChatMessageRow) {
    await this.db.query(
      `insert into communication.chat_messages
       (id, tenant_id, dialog_id, sender_user_id, message_type, text_body, sent_at)
       values ($1,$2,$3,$4,$5,$6,$7::timestamptz)`,
      [
        message.id,
        message.tenantId,
        message.dialogId,
        message.senderUserId,
        message.messageType,
        message.textBody,
        message.sentAt
      ]
    );
    await this.db.query(
      'update communication.chat_dialogs set updated_at = now() where tenant_id = $1 and id = $2',
      [message.tenantId, message.dialogId]
    );
  }

  async incrementUnreadForOtherParticipants(
    tenantId: string,
    dialogId: string,
    senderUserId: string
  ) {
    const rows = await this.db.query<{ user_id: string }>(
      `update communication.chat_participants
       set unread_count = unread_count + 1
       where tenant_id = $1 and dialog_id = $2 and user_id <> $3
       returning user_id`,
      [tenantId, dialogId, senderUserId]
    );
    return rows.map((row) => row.user_id);
  }

  async resetUnreadCount(tenantId: string, dialogId: string, userId: string) {
    await this.db.query(
      `update communication.chat_participants
       set unread_count = 0
       where tenant_id = $1 and dialog_id = $2 and user_id = $3`,
      [tenantId, dialogId, userId]
    );
  }
}
