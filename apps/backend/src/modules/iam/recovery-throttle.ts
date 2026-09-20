/**
 * Ограничение частоты восстановления доступа (ТЗ «Стабилизация, UX и развитие», 17.1).
 *
 * **Что восстанавливают.** Пароля в привычном смысле здесь не восстанавливают: человек,
 * забывший пароль, просит ссылку для входа на свою почту. Это и есть механизм восстановления,
 * и требование 17.1 «ограничение частоты попыток входа И восстановления пароля» относится
 * именно к нему.
 *
 * **Что было (журнал 599).** Частота считалась ТОЛЬКО по сетевому адресу — пять запросов в
 * минуту. Два следствия, и оба плохие:
 *
 * 1. **Офис делит лимит на всех.** Сорок человек предприятия сидят за одним внешним адресом;
 *    шестой, кто забыл пароль в ту же минуту, получает отказ ни за что.
 * 2. **Почтовый ящик человека не защищён вовсе.** Меняя адрес, можно засыпать чужую почту
 *    ссылками для входа без предела — рассылка идёт от имени его учебного центра, и выглядит
 *    это как взлом.
 *
 * **Поэтому предел считается по УЧЁТНОЙ ЗАПИСИ.** Он не заменяет сетевой, а дополняет его:
 * сетевой защищает систему от перебора, этот — человека от заваливания почты.
 *
 * **Ловушка, из-за которой ответ обязан быть одинаковым.** Если при исчерпанном пределе (или
 * при несуществующем адресе) ответ отличается, форма превращается в способ проверять, есть ли
 * такой человек в системе. Поэтому наружу всегда уходит одно и то же «ссылка отправлена»: это
 * не обман, а единственный способ не превратить восстановление в справочник сотрудников.
 */

export interface RecoveryThrottlePolicy {
  /** Сколько ссылок можно запросить на один адрес за окно. */
  maxPerWindow: number;
  /** Длина окна в минутах. */
  windowMinutes: number;
}

/**
 * Умолчания.
 *
 * Три ссылки за пятнадцать минут — это заметно больше, чем нужно человеку (письмо приходит за
 * секунды, а ссылка живёт минуты), и заметно меньше, чем нужно для заваливания почты.
 *
 * Настройка, а не константа: правило репозитория про всё, что выглядит как число.
 */
export const DEFAULT_RECOVERY_THROTTLE: RecoveryThrottlePolicy = {
  maxPerWindow: 3,
  windowMinutes: 15
};

/** Ключ настройки в свободном наборе настроек центра. */
export const RECOVERY_THROTTLE_SETTINGS_KEY = 'recoveryThrottle';

const MIN_PER_WINDOW = 1;
const MAX_PER_WINDOW = 20;
const MIN_WINDOW_MINUTES = 1;
const MAX_WINDOW_MINUTES = 1440;

const clamp = (raw: unknown, fallback: number, min: number, max: number): number => {
  /*
   * Пустое значение — «настройка не задана», а не ноль. Иначе `null` превращается в число 0,
   * приводится к минимуму, и центр молча получает предел в одну ссылку: человек, у которого
   * первое письмо попало в спам, остаётся без входа.
   */
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const whole = Math.floor(value);
  if (whole < min) return min;
  if (whole > max) return max;
  return whole;
};

/**
 * Привести настройку центра к допустимой.
 *
 * Границами защиту отменить нельзя: даже самый щедрый предел остаётся пределом. Это важнее,
 * чем кажется, — настройку правит администратор центра, а страдает от её отмены посторонний
 * человек, чью почту завалят.
 */
export const resolveRecoveryThrottle = (raw: unknown): RecoveryThrottlePolicy => {
  const source = (raw ?? {}) as Partial<Record<keyof RecoveryThrottlePolicy, unknown>>;
  return {
    maxPerWindow: clamp(
      source.maxPerWindow,
      DEFAULT_RECOVERY_THROTTLE.maxPerWindow,
      MIN_PER_WINDOW,
      MAX_PER_WINDOW
    ),
    windowMinutes: clamp(
      source.windowMinutes,
      DEFAULT_RECOVERY_THROTTLE.windowMinutes,
      MIN_WINDOW_MINUTES,
      MAX_WINDOW_MINUTES
    )
  };
};

/** С какого момента считать запросы. */
export const recoveryWindowStart = (now: Date, policy: RecoveryThrottlePolicy): Date =>
  new Date(now.getTime() - policy.windowMinutes * 60_000);

/**
 * Можно ли выдать ещё одну ссылку.
 *
 * Сравнение строгое (`<`): при пределе в три ссылки третий запрос ещё проходит, четвёртый —
 * нет. Нестрогое дало бы на одну ссылку больше, чем обещает настройка, и предел «3» на деле
 * означал бы «4».
 */
export const recoveryAllowed = (recentCount: number, policy: RecoveryThrottlePolicy): boolean =>
  recentCount < policy.maxPerWindow;

/**
 * Что записать в журнал аудита, когда предел сработал.
 *
 * **Адрес почты в журнал не попадает.** Журнал читают сотрудники центра, а по нему можно было
 * бы собрать список адресов, которые кто-то пытается восстановить. Достаточно знать, что
 * предел сработал и сколько раз: этого хватает, чтобы заметить попытку заваливания.
 */
export const recoveryThrottleAudit = (
  recentCount: number,
  policy: RecoveryThrottlePolicy
): Record<string, unknown> => ({
  reason: 'recovery_rate_limited',
  recentCount,
  maxPerWindow: policy.maxPerWindow,
  windowMinutes: policy.windowMinutes
});
