/**
 * Журнал входов в профиле (ТЗ «Стабилизация, UX и развитие», 17.1).
 *
 * **Зачем он человеку.** Это единственное место, где владелец учётной записи может увидеть, что
 * в неё заходили не только он. Ровно за этим журнал и спрашивают при проверке: «когда, откуда,
 * успешно или нет».
 *
 * **Что было.** В журнал аудита попадали только УСПЕШНЫЕ входы. То есть по нему нельзя было
 * увидеть ни попыток подбора, ни того, что человек сам не может войти, — а именно эти две
 * записи и нужны, когда что-то пошло не так (журнал 573).
 *
 * **Правило продукта, которое здесь особенно важно:** ни одного сырого кода как значения.
 * `wrong_password` и строка вида `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`
 * администратору учебного центра не говорят ничего. Поэтому сервер переводит их в слова сам, а
 * не оставляет это экрану.
 */

export interface LoginHistoryEntry {
  /** Когда. */
  at: string;
  /** Чем кончилось — одним словом, понятным без словаря. */
  outcome: 'Успешный вход' | 'Неудачная попытка';
  /** Почему не получилось; у успешного входа пусто. */
  reason?: string;
  /** Откуда: адрес в сети. */
  ip?: string;
  /** С чего заходили — человеческим языком, а не строкой браузера. */
  device?: string;
  /** Каким способом: пароль, ссылка из письма, госуслуги. */
  method?: string;
}

/** Сырая запись журнала аудита — ровно те поля, что нам нужны. */
export interface AuditEntryLike {
  action: string;
  createdAt: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/** Действия, которые и составляют журнал входов. */
export const LOGIN_HISTORY_ACTIONS = [
  'auth.login',
  'auth.magic_link_login',
  'auth.esia_login',
  'auth.login_failed'
] as const;

/**
 * Почему вход не удался — словами.
 *
 * «Учётная запись не найдена» намеренно НЕ говорится человеку в момент входа (иначе логины
 * можно перебирать), но в собственном журнале владельца это уже не тайна: он и так знает свой
 * логин, а вот попытки зайти под чужим именем в его центр ему увидеть полезно.
 */
export const failureReasonRu = (reason: unknown): string => {
  switch (reason) {
    case 'wrong_password':
      return 'Неверный пароль';
    case 'unknown_login':
      return 'Такого логина нет';
    case 'user_blocked':
      return 'Учётная запись заблокирована';
    default:
      return 'Вход не выполнен';
  }
};

/** Каким способом входили. */
export const methodRu = (action: string): string => {
  switch (action) {
    case 'auth.magic_link_login':
      return 'Ссылка из письма';
    case 'auth.esia_login':
      return 'Госуслуги';
    case 'auth.login':
      return 'Пароль';
    default:
      return 'Пароль';
  }
};

/**
 * С какого устройства заходили — по строке браузера.
 *
 * Разбор нарочно грубый: точная модель телефона человеку не нужна и не помогает. Нужен ответ на
 * вопрос «это был я со своего рабочего компьютера или кто-то с чужого телефона», а для него
 * достаточно пары «браузер + вид устройства». Неузнанная строка превращается в «Неизвестное
 * устройство», а не показывается как есть: сырая техническая строка в интерфейсе запрещена
 * правилом продукта.
 */
export const deviceRu = (userAgent: unknown): string => {
  if (typeof userAgent !== 'string' || userAgent.trim().length === 0) {
    return 'Неизвестное устройство';
  }
  const ua = userAgent.toLowerCase();

  const browser = ua.includes('yabrowser')
    ? 'Яндекс Браузер'
    : ua.includes('edg/')
      ? 'Edge'
      : ua.includes('firefox')
        ? 'Firefox'
        : ua.includes('chrome')
          ? 'Chrome'
          : ua.includes('safari')
            ? 'Safari'
            : null;

  const kind = ua.includes('android')
    ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad')
      ? 'iPhone или iPad'
      : ua.includes('windows')
        ? 'Windows'
        : ua.includes('mac os')
          ? 'Mac'
          : ua.includes('linux')
            ? 'Linux'
            : null;

  if (!browser && !kind) return 'Неизвестное устройство';
  if (browser && kind) return `${browser}, ${kind}`;
  return browser ?? kind ?? 'Неизвестное устройство';
};

/** Собрать понятную запись журнала из записи аудита. */
export const toLoginHistoryEntry = (entry: AuditEntryLike): LoginHistoryEntry => {
  const failed = entry.action === 'auth.login_failed';
  return {
    at: entry.createdAt,
    outcome: failed ? 'Неудачная попытка' : 'Успешный вход',
    ...(failed ? { reason: failureReasonRu(entry.metadata?.reason) } : {}),
    ...(entry.ip ? { ip: entry.ip } : {}),
    device: deviceRu(entry.userAgent),
    ...(failed ? {} : { method: methodRu(entry.action) })
  };
};
