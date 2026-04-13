import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Scope
} from '@nestjs/common';
import { type Observable, defaultIfEmpty, defer, from, lastValueFrom, mergeMap, of } from 'rxjs';

import { resolveRequestContext } from '../../../common/utils/request.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';
import { DOCUMENTS_STATE } from '../documents-state.token.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './documents-persistence.token.js';

import type { DocumentsPersistenceBackend } from './documents-persistence.backend.js';
import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';

@Injectable({ scope: Scope.REQUEST })
export class DocumentsRequestPersistenceInterceptor implements NestInterceptor {
  constructor(
    @Inject(DOCUMENTS_STATE) private readonly state: InMemoryDocumentsState,
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
