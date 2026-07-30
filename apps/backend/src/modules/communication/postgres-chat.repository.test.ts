import { describe, expect, it } from 'vitest';

import { PostgresChatRepository } from './postgres-chat.repository.js';

import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Маппинг `communication.chat_*` (покрытие 0% → полное): диалоги видны только
 * участнику, счётчик непрочитанного растёт у ВСЕХ кроме отправителя, создание
 * диалога с участниками — одной транзакцией.
 */
type Call = { sql: string; params: unknown[] };
function fakeDb(routes: Array<{ match: string; rows: unknown[] }>) {
  const calls: Call[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const route = routes.find((r) => sql.includes(r.match));
    return route ? route.rows : [];
  };
  const db = {
    query,
    withTransaction: async (fn: (client: { query: typeof query }) => Promise<void>) => fn({ query })
  } as unknown as DatabaseService;
  return { db, calls };
}

const dialogRow = {
  id: 'd1',
  tenant_id: 't1',
  dialog_type: 'support',
  related_entity_type: null,
  related_entity_id: null,
  assigned_user_id: 'u_mgr',
  created_at: 'c',
  updated_at: 'u',
  total_count: '3'
};

describe('PostgresChatRepository — маппинг и параметры', () => {
  it('listDialogs: join по участнику — чужой диалог в выборку не попадает', async () => {
    const { db, calls } = fakeDb([{ match: 'chat_dialogs', rows: [dialogRow] }]);
    const page = await new PostgresChatRepository(db).listDialogs('t1', 'u1');

    expect(calls[0]!.sql).toContain('p.user_id = $2');
    expect(page.total).toBe(3);
    expect(page.items[0]).toMatchObject({ assignedUserId: 'u_mgr' });
    expect(page.items[0]!.relatedEntityType).toBeUndefined();
  });

  it('listDialogs: пустой userId не превращается в undefined-параметр', async () => {
    const { db, calls } = fakeDb([]);
    await new PostgresChatRepository(db).listDialogs('t1', undefined);
    expect(calls[0]!.params[1]).toBe('');
  });

  it('createDialog: диалог и участники — в ОДНОЙ транзакции', async () => {
    // Диалог без участников — сирота, которого никто не увидит.
    const { db, calls } = fakeDb([]);
    await new PostgresChatRepository(db).createDialog(
      {
        id: 'd1',
        tenantId: 't1',
        type: 'support',
        createdAt: 'c',
        updatedAt: 'u'
      } as never,
      [
        { tenantId: 't1', dialogId: 'd1', userId: 'u1', role: 'member', unreadCount: 0 },
        { tenantId: 't1', dialogId: 'd1', userId: 'u2', role: 'member', unreadCount: 0 }
      ] as never
    );

    expect(calls.filter((c) => c.sql.includes('chat_participants'))).toHaveLength(2);
    expect(calls.filter((c) => c.sql.includes('chat_dialogs'))).toHaveLength(1);
  });

  it('getDialog: пусто → null', async () => {
    const { db } = fakeDb([]);
    await expect(new PostgresChatRepository(db).getDialog('t1', 'x')).resolves.toBeNull();
  });

  it('isParticipant: не участник → false, пусто в ответе тоже false', async () => {
    const { db } = fakeDb([{ match: 'exists', rows: [{ exists: false }] }]);
    await expect(new PostgresChatRepository(db).isParticipant('t1', 'd1', 'u9')).resolves.toBe(
      false
    );
    const { db: empty } = fakeDb([]);
    await expect(new PostgresChatRepository(empty).isParticipant('t1', 'd1', 'u9')).resolves.toBe(
      false
    );
  });

  it('listMessages: сортировка только из фиксированных вариантов', async () => {
    const { db, calls } = fakeDb([]);
    const repo = new PostgresChatRepository(db);
    await repo.listMessages('t1', 'd1', { sort: 'sentAt:asc' });
    await repo.listMessages('t1', 'd1', { sort: "x'; drop table --" as never });
    expect(calls[0]!.sql).toContain('order by sent_at asc');
    expect(calls[1]!.sql).toContain('order by sent_at desc');
    expect(calls[1]!.sql).not.toContain('drop table');
  });

  it('createMessage: сообщение вставляется и «поднимает» диалог', async () => {
    const { db, calls } = fakeDb([]);
    await new PostgresChatRepository(db).createMessage({
      id: 'm1',
      tenantId: 't1',
      dialogId: 'd1',
      senderUserId: 'u1',
      messageType: 'text',
      textBody: 'привет',
      sentAt: 's'
    } as never);

    expect(calls[0]!.sql).toContain('insert into communication.chat_messages');
    expect(calls[1]!.sql).toContain('set updated_at = now()');
  });

  it('incrementUnread: растёт у всех КРОМЕ отправителя, возвращает адресатов', async () => {
    const { db, calls } = fakeDb([
      { match: 'unread_count = unread_count + 1', rows: [{ user_id: 'u2' }, { user_id: 'u3' }] }
    ]);
    const users = await new PostgresChatRepository(db).incrementUnreadForOtherParticipants(
      't1',
      'd1',
      'u1'
    );
    expect(calls[0]!.sql).toContain('user_id <> $3');
    expect(users).toEqual(['u2', 'u3']);
  });

  it('resetUnreadCount: сбрасывается только у читателя', async () => {
    const { db, calls } = fakeDb([]);
    await new PostgresChatRepository(db).resetUnreadCount('t1', 'd1', 'u2');
    expect(calls[0]!.sql).toContain('unread_count = 0');
    expect(calls[0]!.params).toEqual(['t1', 'd1', 'u2']);
  });
});
