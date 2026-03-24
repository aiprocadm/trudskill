import { describe, expect, it } from 'vitest';
import { IamService } from './services/iam.service.js';

describe('permission resolution', () => {
  it('resolves permissions from role bindings', () => {
    const iam = new IamService();
    const permissions = iam.resolvePermissions('tenant_demo', 'u_tenant_admin');
    expect(permissions).toContain('iam.manage_roles');
  });
});
