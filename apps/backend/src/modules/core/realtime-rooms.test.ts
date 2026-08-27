import { describe, expect, it } from 'vitest';

import { resolveRealtimeRooms } from './realtime-rooms.js';

import type { RealtimeEventEnvelope } from './realtime-events.service.js';

const event = (payload: Record<string, unknown>): RealtimeEventEnvelope => ({
  event_name: 'notification.created',
  version: '1',
  tenant_id: 'tenant_demo',
  occurred_at: '2026-08-27T10:00:00.000Z',
  payload
});

/*
 * Ревизия 2026-08-27 (порция 36, журнал 282).
 *
 * Каждое событие живой ленты дублировалось в общую комнату центра, а туда пускают любого
 * вошедшего — идентификатор своего центра человек читает прямо из собственного токена.
 * Значит рядовой слушатель мог подписаться и получать метапоток всего центра: кому пришли
 * уведомления, в каких диалогах идёт переписка, что подписывают. Правило теперь одно:
 * у кого есть адресат — тому и уходит.
 */
describe('адресация событий живой ленты (порция 36)', () => {
  it('личное уведомление уходит только адресату', () => {
    expect(resolveRealtimeRooms(event({ recipient_user_id: 'u_1' }))).toEqual(['user:u_1']);
  });

  it('сообщение в диалоге — только в комнату диалога', () => {
    expect(resolveRealtimeRooms(event({ dialog_id: 'dlg_7', sender_user_id: 'u_2' }))).toEqual([
      'dialog:tenant_demo:dlg_7'
    ]);
  });

  it('событие задачи — в комнату задачи', () => {
    expect(resolveRealtimeRooms(event({ task_id: 'task_9' }))).toEqual(['task:tenant_demo:task_9']);
  });

  it('событие вебинара — в комнату вебинара', () => {
    expect(resolveRealtimeRooms(event({ webinar_id: 'web_3' }))).toEqual([
      'webinar:tenant_demo:web_3'
    ]);
  });

  it('у события с несколькими адресами — все они, но БЕЗ общей комнаты', () => {
    const rooms = resolveRealtimeRooms(event({ recipient_user_id: 'u_1', task_id: 'task_9' }));
    expect(rooms).toEqual(['user:u_1', 'task:tenant_demo:task_9']);
    expect(rooms).not.toContain('tenant:tenant_demo');
  });

  it('событие без адресата — общее для центра: его и должны видеть все', () => {
    expect(resolveRealtimeRooms(event({ branding: 'updated' }))).toEqual(['tenant:tenant_demo']);
  });

  it('пустая нагрузка не роняет разбор', () => {
    expect(resolveRealtimeRooms(event({}))).toEqual(['tenant:tenant_demo']);
  });
});
