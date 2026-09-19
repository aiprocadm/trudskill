/**
 * Одноразовый тикет подключения (ТЗ «Стабилизация, UX и развитие», 9.1).
 *
 * **Что было.** Браузер подключался к потоку событий так:
 * `/stream/user%3Au_admin?access_token=eyJhbGci...` — полноценный токен доступа ехал В АДРЕСЕ.
 * Адрес не секрет: он попадает в журналы веб-сервера, в историю браузера и в заголовок
 * `Referer`, который уходит на чужие сайты. Токен оттуда можно взять и работать от имени
 * человека, пока токен жив (журнал 571).
 *
 * **Что стало.** В адресе едет тикет: случайная строка, которая живёт секунды и **сгорает при
 * первом использовании**. Её тоже видно в журнале, но воспользоваться ею уже нельзя.
 *
 * **Почему разбор здесь, а не общий модуль с бэкендом.** Служба трансляций намеренно не зависит
 * от пакетов приложения — она поднимается отдельно и держит минимум зависимостей (то же
 * основание, по которому здесь лежит копия каталога событий). Расхождение сторожит тест.
 */

export interface RealtimeTicketPayload {
  tenantId: string;
  userId: string;
  sessionId: string;
  roles: string[];
  /** Комната, на которую тикет выдан: на другую он не действует. */
  room: string;
}

/** Тот же ключ, что использует бэкенд при выдаче. Расхождение сторожит тест. */
export const realtimeTicketKey = (ticket: string): string => `realtime:ticket:${ticket}`;

/**
 * Разбор того, что лежало в хранилище.
 *
 * Возвращает `null` на любой неожиданности вместо исключения: подключающемуся незачем
 * различать «тикет просрочен», «тикет уже использован» и «в хранилище мусор» — все три ведут
 * к одному действию, запросить новый тикет.
 */
export const parseRealtimeTicket = (
  raw: string | null | undefined
): RealtimeTicketPayload | null => {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const value = parsed as Record<string, unknown>;
  const { tenantId, userId, sessionId, room } = value;
  if (
    typeof tenantId !== 'string' ||
    typeof userId !== 'string' ||
    typeof sessionId !== 'string' ||
    typeof room !== 'string'
  ) {
    return null;
  }
  const roles = Array.isArray(value.roles)
    ? value.roles.filter((role): role is string => typeof role === 'string')
    : [];
  return { tenantId, userId, sessionId, roles, room };
};

/**
 * Годен ли тикет для этой комнаты.
 *
 * Отдельная проверка, хотя комната уже проверялась при выдаче: тикет выдан на одну комнату, а
 * в адресе стоит другая — значит его переиспользуют не по назначению, и пускать нельзя.
 * Проверка прав на саму комнату (`canAccess`) остаётся сверх этого: она отвечает на другой
 * вопрос — «положено ли этому человеку сюда», а не «про эту ли комнату тикет».
 */
export const ticketMatchesRoom = (payload: RealtimeTicketPayload, room: string): boolean =>
  payload.room === room;
