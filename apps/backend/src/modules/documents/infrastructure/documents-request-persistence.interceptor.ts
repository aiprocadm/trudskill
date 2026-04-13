import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Scope
} from '@nestjs/common';
import { type Observable, defaultIfEmpty, defer, from, lastValueFrom, mergeMap, of } from 'rxjs';

import { MetricsService } from '../../../common/metrics/metrics.service.js';
import { resolveRequestContext } from '../../../common/utils/request.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';
import { DOCUMENTS_STATE } from '../documents-state.token.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './documents-persistence.token.js';

import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';
import type { DocumentsPersistenceBackend } from './documents-persistence.backend.js';

@Injectable({ scope: Scope.REQUEST })
export class DocumentsRequestPersistenceInterceptor implements NestInterceptor {
  constructor(
    @Inject(DOCUMENTS_STATE) private readonly state: InMemoryDocumentsState,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(DOCUMENTS_PERSISTENCE_BACKEND)
    private readonly persistence: DocumentsPersistenceBackend,
    private readonly tenantGateway: TenantSerialGateway
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
          this.metrics.observeDuration(
            'documents_persistence_queue_wait_ms',
            Date.now() - enqueuedAt,
            { backend }
          );

          const loadStarted = Date.now();
          try {
            await this.persistence.loadIntoState(tenantId, this.state);
            this.metrics.incrementCounter('documents_persistence_load_total', {
              backend,
              result: 'ok'
            });
          } catch (error) {
            this.metrics.incrementCounter('documents_persistence_load_total', {
              backend,
              result: 'error'
            });
            throw error;
          } finally {
            this.metrics.observeDuration(
              'documents_persistence_load_duration_ms',
              Date.now() - loadStarted,
              { backend }
            );
          }

          try {
            return await lastValueFrom(next.handle().pipe(defaultIfEmpty(null)));
          } finally {
            const saveStarted = Date.now();
            try {
              await this.persistence.saveFromState(tenantId, this.state);
              this.metrics.incrementCounter('documents_persistence_save_total', {
                backend,
                result: 'ok'
              });
            } catch (error) {
              this.metrics.incrementCounter('documents_persistence_save_total', {
                backend,
                result: 'error'
              });
              throw error;
            } finally {
              this.metrics.observeDuration(
                'documents_persistence_save_duration_ms',
                Date.now() - saveStarted,
                { backend }
              );
            }
          }
        })
      ).pipe(mergeMap((v) => of(v)))
    );
  }
}
