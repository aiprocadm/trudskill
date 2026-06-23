import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import { BackfillController } from './backfill.controller.js';
import { WorkerCallbackGuard } from '../../mvp/infrastructure/worker-callback.guard.js';

// Regression guard for the CRITICAL finding: the migration/backfill controller — which drives
// CROSS-tenant data backfill and exposes reconciliation reports — was registered with NO guard
// at all, so it was reachable unauthenticated. It must stay shielded by the shared-secret guard.
describe('BackfillController is not exposed unauthenticated', () => {
  it('applies WorkerCallbackGuard at the controller level', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, BackfillController) ?? [];
    expect(guards).toContain(WorkerCallbackGuard);
  });
});
