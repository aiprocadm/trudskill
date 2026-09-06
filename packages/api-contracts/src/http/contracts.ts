/**
 * JSON тела ответа при ошибках через Nest HttpExceptionEnvelopeFilter (camelCase meta).
 * См. apps/backend/src/common/filters/http-exception.filter.ts
 */
export interface HttpExceptionErrorBody {
  code: string;
  message: string;
  [key: string]: unknown;
}

export interface HttpExceptionResponseMeta {
  requestId: string;
  correlationId?: string;
  timestamp: string;
}

export interface HttpExceptionResponseJson {
  error: HttpExceptionErrorBody;
  meta: HttpExceptionResponseMeta;
}

/**
 * Коды, которые бэкенд ставит САМ, когда у ошибки нет своего.
 *
 * Своих кодов у бэкенда полторы сотни (`{ code: 'attempt_expired', … }` в исключениях) —
 * их список живёт в коде, а не здесь. Здесь — короткая запасная раскладка: чем подписать
 * ошибку, у которой автор кода не поставил. Такое бывает всегда: строковую форму
 * (`new NotFoundException('Cannot GET /x')`) бросает сам Nest.
 */
export const BackendHttpErrorCodes = {
  internal_error: 'internal_error',
  error: 'error',
  validation_error: 'validation_error',
  auth_required: 'auth_required',
  forbidden: 'forbidden',
  not_found: 'not_found',
  conflict: 'conflict',
  precondition_failed: 'precondition_failed',
  file_too_large: 'file_too_large',
  unsupported_media_type: 'unsupported_media_type',
  too_many_requests: 'too_many_requests'
} as const;

export type BackendHttpErrorCode =
  (typeof BackendHttpErrorCodes)[keyof typeof BackendHttpErrorCodes];

/** Статус ответа → код, если своего кода у ошибки нет. */
const CODE_BY_STATUS: ReadonlyArray<readonly [number, BackendHttpErrorCode]> = [
  [400, BackendHttpErrorCodes.validation_error],
  [401, BackendHttpErrorCodes.auth_required],
  [403, BackendHttpErrorCodes.forbidden],
  [404, BackendHttpErrorCodes.not_found],
  [409, BackendHttpErrorCodes.conflict],
  [412, BackendHttpErrorCodes.precondition_failed],
  [413, BackendHttpErrorCodes.file_too_large],
  [415, BackendHttpErrorCodes.unsupported_media_type],
  [429, BackendHttpErrorCodes.too_many_requests]
];

/**
 * Чем подписать ошибку, у которой своего кода нет.
 *
 * Таблица одна на бэкенд и фронт нарочно: до ревизии 2026-09-06 ответ без кода на обеих
 * сторонах становился `internal_error`, и человек на ошибку своих данных читал «Сбой на
 * стороне сервера — с вашими данными ничего не случилось. Повторите через минуту». Он
 * повторял, и повторялось то же самое: сервер был исправен, а мешало состояние записи.
 *
 * Правило: сбоем сервера называется только то, что им является, — 5xx и обрыв связи.
 * Ошибка клиента получает код своего статуса, а не чужой.
 */
export const httpErrorCodeForStatus = (status: number): BackendHttpErrorCode => {
  const known = CODE_BY_STATUS.find(([code]) => code === status);
  if (known) return known[1];
  if (status >= 500 || status <= 0) return BackendHttpErrorCodes.internal_error;
  return BackendHttpErrorCodes.error;
};
