import type { ChatDialogRow, ChatMessageRow, ChatParticipantRow } from './in-memory-chat.state.js';

export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

export interface ChatDialogsQuery {
  page?: number;
  pageSize?: number;
  sort?: 'updatedAt:asc' | 'updatedAt:desc';
}

export interface ChatMessagesQuery {
  page?: number;
  pageSize?: number;
  sort?: 'sentAt:asc' | 'sentAt:desc';
}

export interface ChatRepository {
  listDialogs(
    tenantId: string,
    userId: string | undefined,
    query: ChatDialogsQuery
  ): Promise<{ items: ChatDialogRow[]; total: number }>;
  createDialog(dialog: ChatDialogRow, participants: ChatParticipantRow[]): Promise<void>;
  getDialog(tenantId: string, dialogId: string): Promise<ChatDialogRow | null>;
  isParticipant(tenantId: string, dialogId: string, userId: string | undefined): Promise<boolean>;
  listMessages(
    tenantId: string,
    dialogId: string,
    query: ChatMessagesQuery
  ): Promise<{ items: ChatMessageRow[]; total: number }>;
  createMessage(message: ChatMessageRow): Promise<void>;
  incrementUnreadForOtherParticipants(
    tenantId: string,
    dialogId: string,
    senderUserId: string
  ): Promise<string[]>;
  resetUnreadCount(tenantId: string, dialogId: string, userId: string): Promise<void>;
}
