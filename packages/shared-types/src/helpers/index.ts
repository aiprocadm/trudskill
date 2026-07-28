import type { TenantId } from '../ids/index.js';

export interface TenantContext {
  tenantId: TenantId;
  role: string;
}

export const tenantGuard = <T extends { tenantId: TenantId }>(
  context: TenantContext,
  entity: T
): T | null => (context.tenantId === entity.tenantId ? entity : null);
