/**
 * Транспорт к API CDOPROF: одна операция — `GET <baseUrl>/api/v1/<method>?…`.
 *
 * Клиент (`CdoprofApiClient`) не знает, откуда берутся ответы: с живого сервера
 * (`HttpCdoprofTransport`) или из обезличенных фикстур (`FixtureCdoprofTransport`). Так весь
 * код выгрузки и — в Фазе 4 — импорта проверяется без ключа API, которого у агента нет (🚫 О1).
 */
export type CdoprofQuery = Record<string, string | number | undefined>;

export interface CdoprofTransport {
  get(method: string, query?: CdoprofQuery): Promise<unknown>;
}

export type CdoprofApiErrorCode =
  | 'unauthorized'
  | 'http_error'
  | 'invalid_json'
  | 'api_error'
  | 'network_error'
  | 'unknown_method';

export class CdoprofApiError extends Error {
  constructor(
    readonly code: CdoprofApiErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(redactApiKey(message));
    this.name = 'CdoprofApiError';
  }
}

/**
 * Вырезает значение `api_key` из любого текста — адреса, тела ответа, сообщения об ошибке.
 * Ключ — секрет владельца; в журнале стенда и в отчёте ему не место.
 */
export const redactApiKey = (text: string): string =>
  text.replace(/(api_key=)[^&\s"']*/gi, '$1***');
