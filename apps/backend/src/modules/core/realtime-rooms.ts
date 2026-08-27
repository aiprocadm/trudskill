import type { RealtimeEventEnvelope } from './realtime-events.service.js';

/**
 * Ревизия 2026-08-27 (порция 36, журнал 282) — куда уходит событие живой ленты.
 *
 * Раньше КАЖДОЕ событие уходило в комнату центра `tenant:<id>`, а в неё пускают любого
 * вошедшего сотрудника — включая слушателя, который знает свой идентификатор центра прямо
 * из собственного токена. То есть один человек мог подписаться и получать метапоток всего
 * центра: кому пришли уведомления, в каких диалогах идёт переписка, что подписывают.
 * Данные не «утекали в интернет», но границу «своё — чужое» это стирало полностью.
 *
 * Правило теперь простое и проверяемое: **у кого есть адресат — тому и уходит.**
 * Личное событие (есть получатель) идёт в личную комнату, предметное (диалог, задача,
 * вебинар) — в комнату предмета, и только событие БЕЗ адресата — общее для центра
 * (например, смена брендирования, которую видят все).
 */
export function resolveRealtimeRooms(event: RealtimeEventEnvelope): string[] {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const addressed: string[] = [];

  if (typeof payload.recipient_user_id === 'string') {
    addressed.push(`user:${payload.recipient_user_id}`);
  }
  if (typeof payload.task_id === 'string') {
    addressed.push(`task:${event.tenant_id}:${payload.task_id}`);
  }
  if (typeof payload.dialog_id === 'string') {
    addressed.push(`dialog:${event.tenant_id}:${payload.dialog_id}`);
  }
  if (typeof payload.webinar_id === 'string') {
    addressed.push(`webinar:${event.tenant_id}:${payload.webinar_id}`);
  }

  // Общая комната центра — только для событий, у которых адресата нет вовсе.
  return addressed.length > 0 ? addressed : [`tenant:${event.tenant_id}`];
}
