import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { TenantScopedRepository } from './tenant-repository.js';

describe('tenant scoped repository', () => {
  it('throws when tenant mismatch detected', () => {
    const repository = new TenantScopedRepository();
    expect(() => repository.enforceTenantScope('tenant_a', 'tenant_b')).toThrow(ForbiddenException);
  });
});
