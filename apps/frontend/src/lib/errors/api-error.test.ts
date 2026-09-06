import { describe, expect, it } from 'vitest';

import { normalizeApiError } from './api-error';

describe('api error normalization', () => {
  it('normalizes error envelope', () => {
    const result = normalizeApiError(403, {
      error: { code: 'FORBIDDEN', message: 'Denied' },
      meta: { request_id: 'req_1', timestamp: '2025-01-01T00:00:00.000Z' }
    });

    expect(result).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Denied',
      requestId: 'req_1'
    });
  });

  it('reads requestId from camelCase meta (Nest envelope)', () => {
    const result = normalizeApiError(500, {
      error: { code: 'internal_error', message: 'Unexpected server error' },
      meta: { requestId: 'req_camel', timestamp: '2025-01-01T00:00:00.000Z' }
    });
    expect(result.requestId).toBe('req_camel');
  });
  /*
   * Ревизия 2026-09-06. Ответ без кода — не редкость: так выглядит любое исключение Nest,
   * брошенное строкой (`{ message, error: 'Bad Request', statusCode: 400 }`), и любой ответ
   * не от нашего бэкенда (страница ошибки шлюза). Раньше такому ответу подставлялся
   * `internal_error`, а словарь отвечал на него «Сбой на стороне сервера — с вашими данными
   * ничего не случилось».
   *
   * То есть на ошибку СВОИХ данных человек читал про поломку сервера и жал ещё раз.
   * Ошибка клиента (4xx) сбоем сервера больше не притворяется: код берётся по статусу.
   */
  it('ответ без кода не выдаётся за сбой сервера', () => {
    const result = normalizeApiError(400, {
      error: { message: 'Only draft application can be updated' },
      meta: { requestId: 'req_2', timestamp: '2025-01-01T00:00:00.000Z' }
    });

    expect(result.code).not.toBe('internal_error');
    expect(result.code).toBe('validation_error');
  });

  it('ответ без конверта вовсе тоже получает код по статусу', () => {
    expect(normalizeApiError(404, undefined).code).toBe('not_found');
    expect(normalizeApiError(409, '<html>gateway</html>').code).toBe('conflict');
  });

  it('сбой сервера остаётся сбоем сервера', () => {
    expect(normalizeApiError(500, undefined).code).toBe('internal_error');
    expect(normalizeApiError(502, undefined).code).toBe('internal_error');
  });
});
