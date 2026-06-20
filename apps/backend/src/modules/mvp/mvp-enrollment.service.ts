import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpTenantRunner } from './infrastructure/mvp-tenant-runner.service.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';
import { LicensesService } from '../org/licenses.service.js';

import type { CreateBulkEnrollmentsRequest } from './mvp.dto.js';
import type { BulkEnrollmentsOutcome } from './mvp.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Performs bulk enrollment from OUTSIDE an HTTP request (e.g. payment fulfillment via webhook or
 * mark-paid in a module that doesn't apply MvpRequestPersistenceInterceptor). Hydrates tenant MVP
 * state from Postgres, runs createBulkEnrollments over a MvpService bound to that state, and the
 * runner persists the mutated state — all under the per-tenant serial lock. createEnrollment uses
 * only state/audit/events/tenantRepo, never documents/files, so those constructor deps are unused
 * here (passed undefined) — verified against mvp.service.ts. A focused test exercises the real path.
 */
@Injectable()
export class MvpEnrollmentService {
  constructor(
    @Inject(MvpTenantRunner) private readonly runner: MvpTenantRunner,
    @Inject(TenantScopedRepository)
    private readonly tenantScopedRepository: TenantScopedRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Optional() @Inject(LicensesService) private readonly licenses?: LicensesService
  ) {}

  async enrollIntoGroup(
    tenantId: string,
    actorId: string | undefined,
    request: CreateBulkEnrollmentsRequest,
    ctx: RequestContext
  ): Promise<BulkEnrollmentsOutcome> {
    return this.runner.runWithTenantStateAndSave(tenantId, async (state: InMemoryMvpState) => {
      const mvp = new MvpService(
        state,
        this.tenantScopedRepository,
        this.audit,
        undefined as never, // DocumentsService — unused by enrollment
        undefined as never, // FilesService — unused by enrollment
        this.events,
        this.licenses
      );
      return mvp.createBulkEnrollments(tenantId, actorId, request, ctx);
    });
  }
}
