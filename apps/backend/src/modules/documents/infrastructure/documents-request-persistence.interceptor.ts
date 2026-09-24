import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Optional,
  Scope
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, defaultIfEmpty, defer, from, lastValueFrom, mergeMap, of } from 'rxjs';

import { MetricsService } from '../../../common/metrics/metrics.service.js';
import { resolveRequestContext } from '../../../common/utils/request.js';
import { TenantStateConflictError } from '../../../infrastructure/database/tenant-state-version.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';
import { DOCUMENTS_STATE } from '../documents-state.token.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './documents-persistence.token.js';
import { TenantTimezoneService } from '../../../infrastructure/tenant/tenant-timezone.service.js';
import {
  type NormalizableCollection,
  isNormalizedRead
} from '../../mvp/infrastructure/normalized-collections.js';
import { READS_NORMALIZED } from '../../mvp/infrastructure/reads-normalized.decorator.js';

import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';
import type { DocumentsPersistenceBackend } from './documents-persistence.backend.js';

@Injectable({ scope: Scope.REQUEST })
export class DocumentsRequestPersistenceInterceptor implements NestInterceptor {
  constructor(
    @Inject(DOCUMENTS_STATE) private readonly state: InMemoryDocumentsState,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(DOCUMENTS_PERSISTENCE_BACKEND)
    private readonly persistence: DocumentsPersistenceBackend,
    @Inject(TenantSerialGateway) private readonly tenantGateway: TenantSerialGateway,
    @Inject(TenantTimezoneService) private readonly timezones: TenantTimezoneService,
    /*
     * Фаза 1, срез 5b: пометка `@ReadsNormalized('generatedDocuments')` на ручке. Параметр
     * ПОСЛЕДНИЙ и необязательный — тесты собирают перехватчик позиционно (журнал 526).
     */
    @Optional() @Inject(Reflector) private readonly reflector?: Reflector
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
    if (this.readsFromNormalizedTable(context)) {
      // Ручка читает документы из таблицы: замок арендатора и девять запросов снимка ей не
      // нужны — в этом и смысл Фазы 1. Сохранять после неё нечего (ручка ничего не пишет).
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

          // Дата документа и период его номера считаются в поясе ЦЕНТРА (журнал 300).
          this.state.tenantTimezone = await this.timezones.resolve(tenantId);

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

          const result = await lastValueFrom(next.handle().pipe(defaultIfEmpty(null)));
          // Persist only on success — a throwing handler must not commit partial mutations
          // (audit tail e). Request-scoped state is discarded on throw = clean rollback.
          // Audit entries persist independently via AuditService.
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
            if (error instanceof TenantStateConflictError) {
              // Отдельный счётчик: обычная ошибка записи и «нас опередили» — разные
              // события, и путать их в одной метрике нельзя.
              this.metrics.incrementCounter('tenant_state_conflict_total', {
                scope: 'documents'
              });
            }
            throw error;
          } finally {
            this.metrics.observeDuration(
              'documents_persistence_save_duration_ms',
              Date.now() - saveStarted,
              { backend }
            );
          }
          return result;
        })
      ).pipe(mergeMap((v) => of(v)))
    );
  }

  private readsFromNormalizedTable(context: ExecutionContext): boolean {
    const targets = [context.getHandler?.(), context.getClass?.()].filter(
      (t): t is NonNullable<typeof t> => Boolean(t)
    );
    if (!this.reflector || targets.length === 0) return false;
    const marked = this.reflector.getAllAndOverride<
      NormalizableCollection | NormalizableCollection[] | undefined
    >(READS_NORMALIZED, targets);
    const collections = marked === undefined ? [] : Array.isArray(marked) ? marked : [marked];
    // Все названные коллекции включены — иначе снимок нужен хотя бы одной из них.
    return collections.length > 0 && collections.every((c) => isNormalizedRead(c));
  }
}
