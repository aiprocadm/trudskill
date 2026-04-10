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

/** Коды ошибок, которые реально отдаёт бэкенд в поле `error.code`. */
export const BackendHttpErrorCodes = {
  internal_error: 'internal_error',
  error: 'error',
  forbidden: 'forbidden',
  not_found: 'not_found',
  precondition_failed: 'precondition_failed'
} as const;

export type BackendHttpErrorCode =
  (typeof BackendHttpErrorCodes)[keyof typeof BackendHttpErrorCodes];
