import {
  type ApiErrorResponse,
  type HttpExceptionResponseJson,
  httpErrorCodeForStatus
} from '@trudskill/api-contracts';

export interface NormalizedApiError {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: Array<{ field?: string; message: string; code?: string }>;
}

export const normalizeApiError = (
  status: number,
  payload: unknown,
  fallbackMessage = 'Unexpected API error'
): NormalizedApiError => {
  const envelope = payload as
    | Partial<ApiErrorResponse>
    | Partial<HttpExceptionResponseJson>
    | undefined;
  /*
   * Ревизия 2026-09-06. Здесь стоял `?? internal_error`, и любой ответ без кода — исключение
   * Nest, брошенное строкой; страница ошибки шлюза; ответ не нашего сервиса — становился
   * «сбоем сервера». Словарь отвечал на такой код «Сбой на стороне сервера — с вашими
   * данными ничего не случилось. Повторите через минуту», и человек повторял снова и снова,
   * хотя сервер был исправен, а мешал его собственный ввод или состояние записи.
   *
   * Таблица «статус → код» общая с бэкендом (`@trudskill/api-contracts`), чтобы обе стороны
   * подписывали безымянную ошибку одинаково.
   */
  const code = envelope?.error?.code ?? httpErrorCodeForStatus(status);
  const meta = envelope?.meta as { request_id?: string; requestId?: string } | undefined;
  const requestId = meta?.request_id ?? meta?.requestId;
  const rawDetails = envelope?.error?.details;
  const details = Array.isArray(rawDetails)
    ? (rawDetails as Array<{ field?: string; message: string; code?: string }>)
    : undefined;

  return {
    status,
    code,
    message: envelope?.error?.message ?? fallbackMessage,
    ...(requestId ? { requestId } : {}),
    ...(details?.length ? { details } : {})
  };
};
