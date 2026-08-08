import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor
} from '@nestjs/common';
import { type Observable, map } from 'rxjs';

import { resolveRequestContext } from '../utils/request.js';

import type { ApiResponse } from '../response/api-response.js';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        if (res.headersSent) {
          // a controller (e.g. the unguarded payment webhook) already sent via @Res(); do not wrap/re-header
          return data;
        }

        /*
         * Ответ, объявленный НЕ как JSON, отдаём как есть (Фаза 6 Task 5).
         *
         * Ручка `/metrics` объявляет `content-type: text/plain` и возвращает строку
         * в формате Prometheus. Конверт заворачивал её в `{ data, meta }` — выходил
         * ответ, который по заголовку текст, а по содержимому объект. Prometheus такое
         * не разбирает: метрики были, а собрать их было нельзя. Правило общее, а не
         * «исключение для /metrics»: если обработчик сам объявил тип ответа и это не
         * JSON, значит он отдаёт готовое представление и обёртка ему только мешает.
         */
        const declaredType = res.getHeader?.('content-type');
        if (typeof declaredType === 'string' && !declaredType.includes('json')) {
          return data;
        }
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
