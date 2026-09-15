/**
 * Потолок неудач у слоя загрузки данных (ТЗ «Стабилизация, UX и развитие», 1.1.3).
 *
 * Требование ТЗ дословно: «максимум N попыток (предложить N=2) с экспоненциальной паузой,
 * после чего экран показывает ошибку и **останавливается**».
 *
 * Зачем это нужно, если повторов у шима не было вовсе. Проблема не в повторах, а в ОПРОСЕ:
 * восемь экранов просят обновление каждые 5–15 секунд (`refetchInterval`), и при лежащем
 * сервере опрос не прекращался никогда — вкладка продолжала слать запросы до закрытия.
 * Несколько открытых вкладок дают поток, который при отказе базы не уменьшается: это ровно
 * то, о чём задача 1.2 «сервер перестаёт отвечать».
 *
 * **Числа здесь — настройка, а не константа** (правило ТЗ: срок, порог, лимит и число попыток
 * задаются настройкой со значением по умолчанию). Значения читаются из окружения сборки,
 * потому что менять их нужно на стенде, не трогая код.
 */

const positiveNumber = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export interface QueryRetryPolicy {
  /** Сколько неудач подряд терпит автоматический опрос, прежде чем остановиться. */
  maxConsecutiveFailures: number;
  /** Пауза перед следующей автоматической попыткой; растёт вдвое с каждой неудачей. */
  backoffMs: number;
}

export const QUERY_RETRY_POLICY: QueryRetryPolicy = {
  maxConsecutiveFailures: positiveNumber(process.env.NEXT_PUBLIC_QUERY_MAX_FAILURES, 2),
  backoffMs: positiveNumber(process.env.NEXT_PUBLIC_QUERY_BACKOFF_MS, 1_000)
};

/**
 * Через сколько ждать следующую автоматическую попытку.
 *
 * Пауза растёт вдвое: при обычном интервале опроса 5–15 секунд это разводит попытки
 * соседних вкладок и не даёт им бить в сервер в такт.
 */
export const backoffFor = (consecutiveFailures: number, policy = QUERY_RETRY_POLICY): number =>
  policy.backoffMs * 2 ** Math.max(0, consecutiveFailures - 1);
