import { BackendHttpErrorCodes } from '@cdoprof/api-contracts';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger
} from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { resolveRequestContext } from '../utils/request.js';

import type { Response } from 'express';

const describeUnknownException = (exception: unknown): string => {
  if (
    typeof AggregateError !== 'undefined' &&
    exception instanceof AggregateError &&
    exception.errors?.length
  ) {
    return exception.errors.map((e) => describeUnknownException(e)).join('; ');
  }
  if (exception instanceof Error) {
    let message = exception.message;
    if (exception.cause instanceof Error) {
      message = `${message} (cause: ${exception.cause.message})`;
    }
    return message;
  }
  return typeof exception === 'string' ? exception : JSON.stringify(exception);
};

const infraFailureLikely = (detail: string): boolean =>
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|password authentication failed|database .*does not exist|relation .*does not exist|no pg_hba/i.test(
    detail
  );

/** Non-production: клиент может увидеть детали; в production только безопасные тексты для типичных infra-сбоев */
const INTERNAL_ERROR_FALLBACK_MESSAGE = 'Unexpected server error';
const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable: ensure PostgreSQL is running (e.g. docker compose up postgres) and DATABASE_URL matches your instance.';

@Injectable()
@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionEnvelopeFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const requestContext = resolveRequestContext(request);

    let status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const normalizeHttpPayload = (value: string | object): string | Record<string, unknown> => {
      if (typeof value === 'string') {
        return value;
      }
      return value as Record<string, unknown>;
    };

    let payload: string | Record<string, unknown> =
      exception instanceof HttpException
        ? normalizeHttpPayload(exception.getResponse())
        : {
            code: BackendHttpErrorCodes.internal_error,
            message: INTERNAL_ERROR_FALLBACK_MESSAGE
          };

    if (!(exception instanceof HttpException)) {
      const detail = describeUnknownException(exception);
      const infra = infraFailureLikely(detail);
      if (infra) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
      }
      const devDetail = backendEnv.NODE_ENV === 'development';
      payload = {
        code: BackendHttpErrorCodes.internal_error,
        message: devDetail
          ? detail
          : infra
            ? DATABASE_UNAVAILABLE_MESSAGE
            : INTERNAL_ERROR_FALLBACK_MESSAGE
      };
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      if (exception instanceof Error) {
        this.logger.error(`${exception.constructor.name}: ${exception.message}`, exception.stack);
        if (
          typeof AggregateError !== 'undefined' &&
          exception instanceof AggregateError &&
          exception.errors?.length
        ) {
          this.logger.error(`Aggregate errors: ${describeUnknownException(exception)}`);
        }
      } else {
        this.logger.error(String(exception));
      }
    }

    response.status(status).json({
      error: typeof payload === 'string' ? { code: 'error', message: payload } : payload,
      meta: {
        requestId: requestContext.requestId,
        correlationId: requestContext.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }
}
