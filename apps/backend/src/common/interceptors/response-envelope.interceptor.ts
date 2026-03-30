import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { ApiResponse } from '../response/api-response.js';
import { resolveRequestContext } from '../utils/request.js';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        const requestContext = resolveRequestContext(req);
        res.setHeader('x-request-id', requestContext.requestId);
        res.setHeader('x-correlation-id', requestContext.correlationId);
        const response: ApiResponse<unknown> = {
          data,
          meta: {
            requestId: requestContext.requestId,
            correlationId: requestContext.correlationId,
            timestamp: new Date().toISOString()
          }
        };

        return response;
      })
    );
  }
}
