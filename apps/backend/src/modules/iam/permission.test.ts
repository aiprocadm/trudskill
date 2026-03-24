import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { IamService } from './services/iam.service.js';

describe('permission resolution', () => {
  it('resolves permissions from role bindings', () => {
    const iam = new IamService(new AuditService());
    const permissions = iam.resolvePermissions('tenant_demo', 'u_tenant_admin');
    expect(permissions).toContain('iam.manage_roles');
  });
});
