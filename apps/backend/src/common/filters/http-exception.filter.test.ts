import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { HttpExceptionEnvelopeFilter } from './http-exception.filter.js';

describe('HttpExceptionEnvelopeFilter', () => {
  /** Минимальный host: запрос с контекстом и ответ, у которого видно status/json. */
  const makeHost = (requestId: string) => {
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn();
    const request = {
      context: {
        requestId,
        correlationId: `corr_${requestId}`,
        tenantId: 'tenant_demo',
        userId: 'u_1',
        sessionId: 's_1',
        ip: '127.0.0.1',
        userAgent: 'vitest'
      },
      header: () => undefined,
      ip: '127.0.0.1',
      get: () => 'vitest'
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusSpy, json: jsonSpy }),
        getRequest: () => request
      })
    };
    return { host: host as never, statusSpy, jsonSpy };
  };

  /** Тело ошибки из последнего ответа. */
  const errorBody = (jsonSpy: ReturnType<typeof vi.fn>): { code: string; message: string } =>
    jsonSpy.mock.calls[0]![0].error;
  it('maps HttpException payload to normalized envelope', () => {
    const filter = new HttpExceptionEnvelopeFilter();
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn();

    const response = {
      status: statusSpy,
      json: jsonSpy
    };
    const request = {
      context: {
        requestId: 'req_1',
        correlationId: 'corr_1',
        tenantId: 'tenant_demo',
        userId: 'u_1',
        sessionId: 's_1',
        ip: '127.0.0.1',
        userAgent: 'vitest'
      },
      header: () => undefined,
      ip: '127.0.0.1',
      get: () => 'vitest'
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request
      })
    };

    const exception = new HttpException(
      { code: 'permission_denied', message: 'Permission denied' },
      HttpStatus.FORBIDDEN
    );
    filter.catch(exception, host as never);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { code: 'permission_denied', message: 'Permission denied' },
      meta: {
        requestId: 'req_1',
        correlationId: 'corr_1',
        timestamp: expect.any(String)
      }
    });
  });

  it('returns internal_error envelope for unknown exception and logs error', () => {
    const filter = new HttpExceptionEnvelopeFilter();
    const logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn();

    const response = {
      status: statusSpy,
      json: jsonSpy
    };
    const request = {
      context: {
        requestId: 'req_2',
        correlationId: 'corr_2',
        tenantId: 'tenant_demo',
        userId: 'u_1',
        sessionId: 's_1',
        ip: '127.0.0.1',
        userAgent: 'vitest'
      },
      header: () => undefined,
      ip: '127.0.0.1',
      get: () => 'vitest'
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request
      })
    };

    filter.catch(new Error('boom'), host as never);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { code: 'internal_error', message: 'Unexpected server error' },
      meta: {
        requestId: 'req_2',
        correlationId: 'corr_2',
        timestamp: expect.any(String)
      }
    });
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
  /*
   * Ревизия 2026-09-06. Nest на строковую форму (`new BadRequestException('Only draft
   * application can be updated')`) отдаёт `{ message, error: 'Bad Request', statusCode: 400 }`
   * — без кода. Фильтр пропускал это тело в конверт как есть, фронт кода не находил и
   * подставлял `internal_error`, а словарь отвечал «Сбой на стороне сервера».
   *
   * Так человек, которому мешает состояние записи, читал про поломку сервера и жал ещё раз.
   * Свои броски ревизия починила поимённо, но строковую форму бросает и сам Nest — 404 на
   * несуществующий адрес, 413 на слишком большое тело. Поэтому код проставляется здесь: это
   * последнее место, через которое проходит ЛЮБАЯ ошибка.
   */
  it('ставит код по статусу, если исключение брошено строкой', () => {
    const filter = new HttpExceptionEnvelopeFilter();
    const { host, statusSpy, jsonSpy } = makeHost('req_3');

    filter.catch(new BadRequestException('Only draft application can be updated'), host);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(errorBody(jsonSpy)).toEqual({
      code: 'validation_error',
      message: 'Only draft application can be updated'
    });
  });

  it('не выдаёт ошибку клиента за сбой сервера', () => {
    const filter = new HttpExceptionEnvelopeFilter();
    const { host, jsonSpy } = makeHost('req_4');

    // Такой 404 бросает сам Nest, когда адреса нет: `{ message, error, statusCode }`.
    filter.catch(new NotFoundException('Cannot GET /admin/nope'), host);

    const body = errorBody(jsonSpy);
    expect(body.code).toBe('not_found');
    expect(body.code).not.toBe('internal_error');
  });

  it('оставляет тело как есть, если код уже проставлен', () => {
    const filter = new HttpExceptionEnvelopeFilter();
    const { host, jsonSpy } = makeHost('req_5');

    filter.catch(
      new BadRequestException({ code: 'domain_rule_violation', message: 'Заявка не черновик' }),
      host
    );

    expect(errorBody(jsonSpy)).toEqual({
      code: 'domain_rule_violation',
      message: 'Заявка не черновик'
    });
  });

  it('не тащит в конверт служебные поля Nest', () => {
    const filter = new HttpExceptionEnvelopeFilter();
    const { host, jsonSpy } = makeHost('req_6');

    filter.catch(new BadRequestException('Template version mismatch'), host);

    // `error: 'Bad Request'` и `statusCode: 400` человеку не нужны, а в спойлер «Подробности»
    // фронт кладёт код и статус сам.
    expect(Object.keys(errorBody(jsonSpy)).sort()).toEqual(['code', 'message']);
  });
});
