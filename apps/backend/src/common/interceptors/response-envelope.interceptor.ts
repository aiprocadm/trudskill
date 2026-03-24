import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { ApiResponse } from '../response/api-response.js';
import { resolveRequestContext } from '../utils/request.js';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const req = context.switchToHttp().getRequest();
        const requestContext = resolveRequestContext(req);
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
