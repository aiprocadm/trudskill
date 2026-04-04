import { describe, expect, it } from 'vitest';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { NotificationsService } from './notifications.service.js';
import { ChatService } from './chat.service.js';
import { WebinarsService } from './webinars.service.js';

describe('Communication foundations', () => {
  it('creates notification and unread/read flow', async () => {
    const realtime = new RealtimeEventsService();
    const notifications = new NotificationsService(realtime);
    const created = await notifications.create({ tenantId: 't1', recipientUserId: 'u2', channelCode: 'in_app', subjectText: 'S', bodyText: 'B' });
    expect(await notifications.unreadCounter('t1', 'u2')).toBe(1);
    await notifications.read('t1', created.id, 'u2');
    expect(await notifications.unreadCounter('t1', 'u2')).toBe(0);
  });

  it('enforces chat access by participant', () => {
    const realtime = new RealtimeEventsService();
    const notifications = new NotificationsService(realtime);
    const chat = new ChatService(realtime, notifications);
    const dialog = chat.createDialog('t1', 'u1', { type: 'support', participantUserIds: ['u1', 'u2'] });
    expect(chat.listDialogs('t1', 'u3')).toHaveLength(0);
    const message = chat.postMessage('t1', dialog.id, 'u1', 'hello');
    expect(message.textBody).toBe('hello');
  });

  it('supports webinar CRUD foundation', () => {
    const webinars = new WebinarsService(new RealtimeEventsService());
    const webinar = webinars.create('t1', 'u1', { title: 'W1', status: 'planned', plannedStartAt: new Date().toISOString(), plannedEndAt: new Date(Date.now() + 3600_000).toISOString() });
    webinars.patch('t1', webinar.id, { status: 'live' });
    expect(webinars.get('t1', webinar.id).status).toBe('live');
  });
});
