import { describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { IamService } from './services/iam.service.js';

describe('permission resolution', () => {
  it('resolves permissions from role bindings', async () => {
    const iam = new IamService(new AuditService());
    const permissions = await iam.resolvePermissions('tenant_demo', 'u_tenant_admin');
    expect(permissions).toContain('iam.manage_roles');
  });

  // §5.158 — DB-less fallback is intentionally coarse: any seeded user (not only admins)
  // resolves to the full staff permission set. Locks the behaviour after removing the dead
  // admin-role conditional, so nobody re-introduces a broken half-gate.
  it('grants the full fallback permission set to a non-admin seeded user (no databaseService)', async () => {
    const iam = new IamService(new AuditService());
    const permissions = await iam.resolvePermissions('tenant_demo', 'u_manager');
    expect(permissions).toContain('iam.manage_roles');
    expect(permissions).toContain('assessment.read.cross_learner');
  });
});
