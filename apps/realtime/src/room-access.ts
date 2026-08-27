/** Сессия, читаемая из токена доступа. */
export interface RoomSession {
  tenantId: string;
  userId: string;
  roles: string[];
}

/**
 * Ревизия 2026-08-27 (порция 36, журнал 282) — кого пускать в комнату живой ленты.
 *
 * Идентификатор своего центра человек знает прямо из собственного токена, поэтому проверка
 * «комната твоего арендатора» не отсекала никого: слушатель подписывался на общую комнату
 * и получал поток событий всего центра — кому пришли уведомления, в каких диалогах идёт
 * переписка, что подписывают. Теперь в общую комнату пускают только персонал, а личные и
 * предметные события туда больше и не публикуются (правило адресации на стороне бэкенда) —
 * две меры, а не одна: даже если правило публикации однажды ослабят, комната закрыта.
 */
export function canAccessRoom(session: RoomSession, room: string): boolean {
  if (!session.tenantId || !session.userId) return false;
  const [type, first, second] = room.split(':');

  if (type === 'tenant') {
    if (first !== session.tenantId) return false;
    // Роль слушателя сама по себе доступа к общей ленте центра не даёт.
    return (session.roles ?? []).some((role) => role !== 'learner');
  }
  if (type === 'user') return first === session.userId;
  if (type === 'task' || type === 'dialog' || type === 'webinar') {
    return Boolean(first && first === session.tenantId && second);
  }
  return false;
}
