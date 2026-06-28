import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Scope
} from '@nestjs/common';
import { type Observable, defaultIfEmpty, defer, from, lastValueFrom, mergeMap, of } from 'rxjs';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { MVP_PERSISTENCE_BACKEND } from './mvp-persistence.token.js';
import { MVP_STATE } from './mvp-state.token.js';
import { MetricsService } from '../../../common/metrics/metrics.service.js';
import { resolveRequestContext } from '../../../common/utils/request.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';

import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';

@Injectable({ scope: Scope.REQUEST })
export class MvpRequestPersistenceInterceptor implements NestInterceptor {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(MVP_PERSISTENCE_BACKEND) private readonly persistence: MvpPersistenceBackend,
    @Inject(TenantSerialGateway) private readonly tenantGateway: TenantSerialGateway
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest();
    const ctx = resolveRequestContext(req);
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      return next.handle();
    }
    const enqueuedAt = Date.now();
    const backend = this.persistence.constructor.name;

    return defer(() =>
      from(
        this.tenantGateway.runExclusive(tenantId, async () => {
          this.metrics.observeDuration('mvp_persistence_queue_wait_ms', Date.now() - enqueuedAt, {
            backend
          });

          const loadStarted = Date.now();
          try {
            await this.persistence.loadIntoState(tenantId, this.state);
            this.metrics.incrementCounter('mvp_persistence_load_total', { backend, result: 'ok' });
          } catch (error) {
            this.metrics.incrementCounter('mvp_persistence_load_total', {
              backend,
              result: 'error'
            });
            throw error;
          } finally {
            this.metrics.observeDuration(
              'mvp_persistence_load_duration_ms',
              Date.now() - loadStarted,
              { backend }
            );
          }

          const result = await lastValueFrom(next.handle().pipe(defaultIfEmpty(null)));
          // Persist only on success — a throwing handler must not commit partial mutations
          // (audit tail e). Request-scoped state is discarded on throw = clean rollback.
          // Audit entries persist independently via AuditService.
          const saveStarted = Date.now();
          try {
            await this.persistence.saveFromState(tenantId, this.state);
            this.metrics.incrementCounter('mvp_persistence_save_total', {
              backend,
              result: 'ok'
            });
          } catch (error) {
            this.metrics.incrementCounter('mvp_persistence_save_total', {
              backend,
              result: 'error'
            });
            throw error;
          } finally {
            this.metrics.observeDuration(
              'mvp_persistence_save_duration_ms',
              Date.now() - saveStarted,
              { backend }
            );
          }
          return result;
        })
      ).pipe(mergeMap((v) => of(v)))
    );
  }
}
