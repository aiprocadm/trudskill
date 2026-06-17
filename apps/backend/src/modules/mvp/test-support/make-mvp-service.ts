/**
 * Shared test harness for MvpService unit tests.
 * Mirrors the exact pattern used in identity-verification.service.test.ts
 * (6-arg constructor: state, tenantRepo, audit, documents, files, eventEmitter).
 */
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {} as unknown as FilesService;

export const TEST_TENANT_ID = 'tenant_demo';
export const TEST_ACTOR_ID = 'u_test_actor';

export interface MvpServiceHarness {
  service: MvpService;
  state: InMemoryMvpState;
  tenantId: string;
  ctx: RequestContext;
}

export function makeMvpService(): MvpServiceHarness {
  const state = new InMemoryMvpState();
  const service = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
  const tenantId = TEST_TENANT_ID;
  const ctx: RequestContext = {
    requestId: 'req_test',
    correlationId: 'corr_test',
    tenantId,
    userId: TEST_ACTOR_ID,
    ip: '127.0.0.1',
    userAgent: 'vitest'
  };
  return { service, state, tenantId, ctx };
}
