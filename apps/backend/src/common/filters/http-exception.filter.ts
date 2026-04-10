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

import { resolveRequestContext } from '../utils/request.js';

import type { Response } from 'express';

@Injectable()
@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionEnvelopeFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const requestContext = resolveRequestContext(request);

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            code: BackendHttpErrorCodes.internal_error,
            message: 'Unexpected server error'
          };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      if (exception instanceof Error) {
        this.logger.error(exception.message, exception.stack);
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
