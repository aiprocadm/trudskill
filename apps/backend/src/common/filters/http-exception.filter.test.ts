import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { HttpExceptionEnvelopeFilter } from './http-exception.filter.js';

describe('HttpExceptionEnvelopeFilter', () => {
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
});
