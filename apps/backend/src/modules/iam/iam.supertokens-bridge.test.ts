import { describe, expect, it, vi } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { IamService } from './services/iam.service.js';

describe('IamService supertokens bridge', () => {
  it('returns null bridge in memory mode', async () => {
    const iam = new IamService(new AuditService());
    await expect(
      iam.findSuperTokensBridgeByUserId('tenant_demo', 'u_tenant_admin')
    ).resolves.toBeNull();
    await expect(
      iam.upsertSuperTokensBridge({
        tenantId: 'tenant_demo',
        userId: 'u_tenant_admin',
        supertokensUserId: 'st-user-1'
      })
    ).resolves.toBeNull();
  });

  it('upserts and maps bridge row for postgres mode', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'stb_1',
          tenant_id: 'tenant_demo',
          user_id: 'u_tenant_admin',
          supertokens_user_id: 'st_1',
          password_migration_status: 'imported',
          rehash_required: false
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'stb_1',
          tenant_id: 'tenant_demo',
          user_id: 'u_tenant_admin',
          supertokens_user_id: 'st_1',
          password_migration_status: 'imported',
          rehash_required: false
        }
      ]);
    const db = { query };
    const iam = new IamService(new AuditService(), db as never);

    const created = await iam.upsertSuperTokensBridge({
      tenantId: 'tenant_demo',
      userId: 'u_tenant_admin',
      supertokensUserId: 'st_1',
      passwordMigrationStatus: 'imported',
      rehashRequired: false
    });
    expect(created).toEqual({
      id: 'stb_1',
      tenantId: 'tenant_demo',
      userId: 'u_tenant_admin',
      supertokensUserId: 'st_1',
      passwordMigrationStatus: 'imported',
      rehashRequired: false
    });

    const resolved = await iam.findSuperTokensBridgeByUserId('tenant_demo', 'u_tenant_admin');
    expect(resolved).toEqual(created);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
