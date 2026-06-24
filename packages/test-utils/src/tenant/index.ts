import { type TenantId, asTenantId } from '@trudskill/shared-types';

export const createTestTenant = (seed = 'tenant'): { id: TenantId; name: string } => ({
  id: asTenantId(`${seed}-${crypto.randomUUID()}`),
  name: `Tenant ${seed}`
});
