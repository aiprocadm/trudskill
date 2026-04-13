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
import { resolveRequestContext } from '../../../common/utils/request.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';

import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';

@Injectable({ scope: Scope.REQUEST })
export class MvpRequestPersistenceInterceptor implements NestInterceptor {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MVP_PERSISTENCE_BACKEND) private readonly persistence: MvpPersistenceBackend,
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

    return defer(() =>
      from(
        this.tenantGateway.runExclusive(tenantId, async () => {
          await this.persistence.loadIntoState(tenantId, this.state);
          try {
            return await lastValueFrom(next.handle().pipe(defaultIfEmpty(null)));
          } finally {
            await this.persistence.saveFromState(tenantId, this.state);
          }
        })
      ).pipe(mergeMap((v) => of(v)))
    );
  }
}
