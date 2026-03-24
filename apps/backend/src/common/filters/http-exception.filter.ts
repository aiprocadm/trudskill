import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable
} from '@nestjs/common';
import type { Response } from 'express';
import { resolveRequestContext } from '../utils/request.js';

@Injectable()
@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
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
            code: 'internal_error',
            message: 'Unexpected server error'
          };

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
