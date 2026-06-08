import { describe, expect, it } from 'vitest';

import { TenantService } from './tenant.service.js';

describe('TenantService.listActiveTenantIds (in-memory fallback)', () => {
  it('returns the demo tenant id when no database is configured', async () => {
    const service = new TenantService({ enforceTenantScope: () => undefined } as never);
    expect(await service.listActiveTenantIds()).toEqual(['tenant_demo']);
  });
});
