/**
 * Скоуп представителя заказчика (ФТ-E5, Фаза 4 Task 1) — чистая часть.
 *
 * **Правило, ради которого всё это существует:** представитель видит только своих
 * сотрудников. Портал заказчика сегодня отдаёт полные списки центра — он изначально
 * сделан как обзор для персонала. Утечки пока нет лишь потому, что роли представителя
 * не существовало; вводя роль, скоуп обязаны ввести в том же шаге.
 *
 * **Скоуп берётся из личности актора, а не из параметра запроса.** Идентификатор,
 * пришедший от клиента, подменяется тривиально; привязка пользователя к контрагенту —
 * нет. Поэтому функции ниже принимают контрагента актора, а не «фильтр».
 */

export interface CounterpartyScope {
  /** Актор ограничен одним контрагентом (представитель заказчика). */
  restricted: boolean;
  /** Контрагент актора; пусто у персонала центра. */
  counterpartyId?: string;
}

/**
 * Скоуп по актору.
 *
 * Персонал центра (`counterpartyId` пуст) не ограничен — он и должен видеть всех
 * заказчиков. Представитель ограничен всегда.
 */
export function resolveCounterpartyScope(actor: {
  counterpartyId?: string | null;
}): CounterpartyScope {
  const id = actor.counterpartyId?.trim();
  return id ? { restricted: true, counterpartyId: id } : { restricted: false };
}

/**
 * Видит ли актор сущность, принадлежащую данному контрагенту.
 *
 * **Сущность БЕЗ контрагента представителю не видна.** Это осознанно: группа без
 * заказчика — внутренняя группа центра, и показывать её постороннему нельзя. Обратное
 * поведение («нет владельца — значит общий») превратило бы каждую незаполненную связь
 * в дыру.
 */
export function scopeAllows(scope: CounterpartyScope, entityCounterpartyId?: string): boolean {
  if (!scope.restricted) return true;
  if (!entityCounterpartyId) return false;
  return entityCounterpartyId === scope.counterpartyId;
}

/** Фильтрация списка по скоупу — общая форма для всех выборок портала. */
export function filterByCounterparty<T>(
  scope: CounterpartyScope,
  items: readonly T[],
  getCounterpartyId: (item: T) => string | undefined
): T[] {
  if (!scope.restricted) return [...items];
  return items.filter((item) => scopeAllows(scope, getCounterpartyId(item)));
}

/**
 * Проверка доступа к ОДНОЙ сущности по идентификатору из URL.
 *
 * Возвращает `false` вместо выбрасывания намеренно: вызывающий обязан ответить
 * «не найдено», а не «запрещено». Отказ, отличающий существующую чужую запись от
 * несуществующей, сам по себе выдаёт факт её существования.
 */
export function scopeAllowsEntity(
  scope: CounterpartyScope,
  entity: { counterpartyId?: string } | undefined
): boolean {
  if (!entity) return false;
  return scopeAllows(scope, entity.counterpartyId);
}
