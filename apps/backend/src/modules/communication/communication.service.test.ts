import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ChatService } from './chat.service.js';
import { InMemoryChatState } from './in-memory-chat.state.js';
import { InMemoryNotificationsState } from './in-memory-notifications.state.js';
import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { NotificationsService } from './notifications.service.js';
import { WebinarsService } from './webinars.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

describe('Communication foundations', () => {
  it('creates notification and unread/read flow', async () => {
    const realtime = new RealtimeEventsService();
    const notifications = new NotificationsService(new InMemoryNotificationsState(), realtime);
    const created = await notifications.create({
      tenantId: 't1',
      recipientUserId: 'u2',
      channelCode: 'in_app',
      subjectText: 'S',
      bodyText: 'B'
    });
    expect(await notifications.unreadCounter('t1', 'u2')).toBe(1);
    await notifications.read('t1', created.id, 'u2');
    expect(await notifications.unreadCounter('t1', 'u2')).toBe(0);
  });

  it('enforces chat access by participant', async () => {
    const realtime = new RealtimeEventsService();
    const notifications = new NotificationsService(new InMemoryNotificationsState(), realtime);
    const chat = new ChatService(new InMemoryChatState(), realtime, notifications);
    const dialog = await chat.createDialog('t1', 'u1', {
      type: 'support',
      participantUserIds: ['u1', 'u2']
    });
    const dialogs = await chat.listDialogs('t1', 'u3', {});
    expect(dialogs.items).toHaveLength(0);
    const message = await chat.postMessage('t1', dialog.id, 'u1', 'hello');
    expect(message.textBody).toBe('hello');
  });

  it('supports webinar CRUD foundation', async () => {
    const webinars = new WebinarsService(new InMemoryWebinarsState(), new RealtimeEventsService());
    const webinar = await webinars.create('t1', 'u1', {
      title: 'W1',
      status: 'planned',
      plannedStartAt: new Date().toISOString(),
      plannedEndAt: new Date(Date.now() + 3600_000).toISOString()
    });
    await webinars.patch('t1', webinar.id, { status: 'live' });
    const saved = await webinars.get('t1', webinar.id);
    expect(saved.status).toBe('live');
  });

  it('scopes notifications.get by tenantId when id collides across tenants', async () => {
    const realtime = new RealtimeEventsService();
    const store = new InMemoryNotificationsState();
    const notifications = new NotificationsService(store, realtime);
    const now = new Date().toISOString();
    const sharedId = 'notif_same_id';
    store.notifications.push(
      {
        id: sharedId,
        tenantId: 'tenant_a',
        recipientUserId: 'u1',
        channelCode: 'in_app',
        subjectText: 'A',
        bodyText: 'body-a',
        status: 'unread',
        createdAt: now
      },
      {
        id: sharedId,
        tenantId: 'tenant_b',
        recipientUserId: 'u1',
        channelCode: 'in_app',
        subjectText: 'B',
        bodyText: 'body-b',
        status: 'unread',
        createdAt: now
      }
    );

    const a = await notifications.get('tenant_a', sharedId, 'u1');
    const b = await notifications.get('tenant_b', sharedId, 'u1');
    expect(a.bodyText).toBe('body-a');
    expect(b.bodyText).toBe('body-b');

    await expect(notifications.get('tenant_a', sharedId, 'u_other')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('scopes webinars.get by tenantId when id collides across tenants', async () => {
    const state = new InMemoryWebinarsState();
    const webinars = new WebinarsService(state, new RealtimeEventsService());
    const now = new Date().toISOString();
    const sharedId = 'web_same_id';
    const base = {
      id: sharedId,
      title: 'T',
      status: 'planned' as const,
      plannedStartAt: now,
      plannedEndAt: new Date(Date.now() + 3600_000).toISOString(),
      createdBy: 'u1',
      createdAt: now,
      updatedAt: now
    };
    state.webinars.push(
      { ...base, tenantId: 'tenant_a' },
      { ...base, tenantId: 'tenant_b', title: 'Other' }
    );

    const a = await webinars.get('tenant_a', sharedId);
    const b = await webinars.get('tenant_b', sharedId);
    expect(a.title).toBe('T');
    expect(b.title).toBe('Other');
  });

  it('scopes chat getDialog by tenantId when dialog id collides across tenants', async () => {
    const realtime = new RealtimeEventsService();
    const notifications = new NotificationsService(new InMemoryNotificationsState(), realtime);
    const chatState = new InMemoryChatState();
    const chat = new ChatService(chatState, realtime, notifications);
    const now = new Date().toISOString();
    const sharedDialogId = 'dlg_same_id';
    chatState.dialogs.push(
      {
        id: sharedDialogId,
        tenantId: 'tenant_a',
        type: 'support',
        createdAt: now,
        updatedAt: now
      },
      {
        id: sharedDialogId,
        tenantId: 'tenant_b',
        type: 'support',
        createdAt: now,
        updatedAt: now
      }
    );
    chatState.participants.push(
      {
        dialogId: sharedDialogId,
        tenantId: 'tenant_a',
        userId: 'u1',
        role: 'owner',
        unreadCount: 0
      },
      {
        dialogId: sharedDialogId,
        tenantId: 'tenant_b',
        userId: 'u2',
        role: 'owner',
        unreadCount: 0
      }
    );

    const da = await chat.getDialog('tenant_a', sharedDialogId, 'u1');
    const db = await chat.getDialog('tenant_b', sharedDialogId, 'u2');
    expect(da.tenantId).toBe('tenant_a');
    expect(db.tenantId).toBe('tenant_b');
    await expect(chat.getDialog('tenant_a', sharedDialogId, 'u2')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});
