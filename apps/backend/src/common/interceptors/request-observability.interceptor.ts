import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLogger } from '../logging/logger.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { resolveRequestContext } from '../utils/request.js';

@Injectable()
export class RequestObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: AppLogger,
    private readonly metrics: MetricsService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const ctx = resolveRequestContext(req);
    const route = req.route?.path ?? req.url;
    const method = req.method;

    this.metrics.trackRequestStart();
    this.logger.info('request_started', {
      event_type: 'http_request_started',
      request_id: ctx.requestId,
      correlation_id: ctx.correlationId,
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      route,
      operation: `${method} ${route}`
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - started;
          const status = res.statusCode ?? 200;
          this.metrics.trackRequestEnd(route, method, status, duration);
          this.logger.info('request_completed', {
            event_type: 'http_request_completed',
            request_id: ctx.requestId,
            correlation_id: ctx.correlationId,
            route,
            operation: `${method} ${route}`,
            duration_ms: duration,
            status_code: status
          });
        },
        error: (error: unknown) => {
          const duration = Date.now() - started;
          const status = res.statusCode ?? 500;
          this.metrics.trackRequestEnd(route, method, status, duration);
          this.logger.error('request_failed', {
            event_type: 'http_request_failed',
            request_id: ctx.requestId,
            correlation_id: ctx.correlationId,
            route,
            operation: `${method} ${route}`,
            duration_ms: duration,
            status_code: status,
            error_code: error instanceof Error ? error.name : 'unknown_error',
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      })
    );
  }
}
