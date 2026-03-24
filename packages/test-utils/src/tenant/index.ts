import { asTenantId, type TenantId } from '../../../shared-types/src/index.ts';

export const createTestTenant = (seed = 'tenant'): { id: TenantId; name: string } => ({
  id: asTenantId(`${seed}-${crypto.randomUUID()}`),
  name: `Tenant ${seed}`
});
