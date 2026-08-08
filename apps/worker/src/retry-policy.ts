/**
 * Политика повторов и карантина (ФТ-I1, Фаза 6 Task 7).
 *
 * ЗАЧЕМ ОТДЕЛЬНЫМ МОДУЛЕМ. Раньше эти правила жили тремя функциями внутри `main.ts`,
 * рядом с подключением к RabbitMQ и базе, — то есть проверить их можно было только
 * подняв всю очередь. Ни одного теста на них не было, хотя именно они решают, повторить
 * документ или отправить его в карантин.
 *
 * ГЛАВНАЯ ПОЧИНКА. `extractRetryCount` читал `message.properties.headers['x-retry-count']`
 * напрямую. У сообщения, опубликованного без заголовков (чужой издатель, ручная
 * переотправка через админку RabbitMQ, старый формат), `headers` равен `undefined` —
 * чтение поля роняло обработчик. Причём вызов стоял ВНЕ `try`, поэтому падал не один
 * документ, а весь консьюмер: воркер переставал разбирать очередь целиком.
 */

export type RetryDecision = 'retry' | 'dead-letter';

export interface RetryPolicyLimits {
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

/**
 * Ошибки, которые повторять бессмысленно: данные не станут валиднее от второй попытки.
 * Такое сообщение отправляется в карантин сразу, не тратя десять заходов с задержками.
 */
const NON_RETRYABLE_ERROR_NAMES = new Set(['ValidationError', 'NonRetryableJobError']);

/**
 * Сколько раз сообщение уже пробовали. Читает что угодно и никогда не бросает:
 * отсутствующие заголовки, чужой формат, строка вместо числа, отрицательное значение —
 * всё это «попыток не было», а не повод уронить разбор очереди.
 */
export const extractRetryCount = (message: unknown): number => {
  const headers = (message as { properties?: { headers?: unknown } } | null)?.properties?.headers;
  if (!headers || typeof headers !== 'object') {
    return 0;
  }
  const raw = (headers as Record<string, unknown>)['x-retry-count'];
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
};

/**
 * Задержка перед следующей попыткой: удваивается с каждым разом, но не больше предела.
 * Смысл — дать упавшей зависимости (Gotenberg, S3, база) время подняться, а не долбить
 * её десять раз подряд.
 */
export const computeBackoffMs = (retryCount: number, limits: RetryPolicyLimits): number => {
  const exponential = limits.backoffBaseMs * 2 ** Math.max(0, retryCount - 1);
  return Math.min(limits.backoffMaxMs, exponential);
};

export const decideRetry = (
  retryCount: number,
  error: unknown,
  limits: RetryPolicyLimits
): RetryDecision => {
  if (retryCount >= limits.maxRetries) {
    return 'dead-letter';
  }
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  if (NON_RETRYABLE_ERROR_NAMES.has(errorName)) {
    return 'dead-letter';
  }
  return 'retry';
};

/**
 * Разбор сообщения из карантина: что показать человеку в списке.
 *
 * Сообщение попадает в очередь `jobs.dead-letter` в том виде, в каком его отверг воркер,
 * поэтому разбирать нужно осторожно: тело может оказаться не-JSON, а заголовков может
 * не быть вовсе. Ни один такой случай не должен ронять консьюмер карантина — иначе
 * одно битое сообщение заблокирует показ всех остальных.
 */
export interface QuarantinedMessage {
  messageId: string | null;
  tenantId: string | null;
  jobType: string | null;
  payload: unknown;
  retryCount: number;
  lastError: string | null;
  routingKey: string | null;
  rawBody: string;
}

export const parseQuarantinedMessage = (
  content: Buffer | string,
  properties: unknown,
  routingKey?: string
): QuarantinedMessage => {
  const rawBody = typeof content === 'string' ? content : content.toString('utf8');
  const headers =
    ((properties as { headers?: Record<string, unknown> } | null)?.headers as
      | Record<string, unknown>
      | undefined) ?? {};

  let parsed: Record<string, unknown> | null = null;
  try {
    const candidate: unknown = JSON.parse(rawBody);
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    // Не-JSON в карантине — это нормально: там лежит ровно то, что не смогли обработать.
    parsed = null;
  }

  const asString = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

  return {
    messageId:
      asString(parsed?.messageId) ??
      asString((properties as { messageId?: unknown } | null)?.messageId),
    tenantId: asString(parsed?.tenantId),
    jobType: asString(parsed?.jobType),
    payload: parsed?.payload ?? null,
    retryCount: extractRetryCount({ properties }),
    lastError: asString(headers['x-last-error']),
    routingKey: asString(routingKey),
    rawBody
  };
};
