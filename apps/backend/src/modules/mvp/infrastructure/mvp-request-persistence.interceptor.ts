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

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { MVP_PERSISTENCE_BACKEND } from './mvp-persistence.token.js';
import { MVP_STATE } from './mvp-state.token.js';
import { type NormalizableCollection, isNormalizedRead } from './normalized-collections.js';
import { READS_NORMALIZED } from './reads-normalized.decorator.js';
import { MetricsService } from '../../../common/metrics/metrics.service.js';
import { resolveRequestContext } from '../../../common/utils/request.js';
import { TenantStateConflictError } from '../../../infrastructure/database/tenant-state-version.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';
import { TenantTimezoneService } from '../../../infrastructure/tenant/tenant-timezone.service.js';

import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';

@Injectable({ scope: Scope.REQUEST })
export class MvpRequestPersistenceInterceptor implements NestInterceptor {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(MVP_PERSISTENCE_BACKEND) private readonly persistence: MvpPersistenceBackend,
    @Inject(TenantSerialGateway) private readonly tenantGateway: TenantSerialGateway,
    @Inject(TenantTimezoneService) private readonly timezones: TenantTimezoneService,
    /* Фаза 1 (срез 1b): читает пометку `@ReadsNormalized`. ПОСЛЕДНИЙ и необязательный —
       тесты собирают интерцептор позиционно пятью аргументами. */
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
      // Ручка читает коллекцию из нормализованной таблицы: замок арендатора и снимок ей не
      // нужны — в этом и смысл Фазы 1. Сохранять после неё нечего (ручка ничего не пишет).
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

          // Календарные даты считаются в поясе ЦЕНТРА (журнал 301).
          this.state.tenantTimezone = await this.timezones.resolve(tenantId);

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
            if (error instanceof TenantStateConflictError) {
              // Отдельный счётчик: обычная ошибка записи и «нас опередили» —
              // разные события, и путать их в одной метрике нельзя.
              this.metrics.incrementCounter('tenant_state_conflict_total', {
                scope: 'mvp'
              });
            }
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
