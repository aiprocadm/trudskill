import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class TenantScopedRepository {
  enforceTenantScope(expectedTenantId: string, actualTenantId: string): void {
    if (!expectedTenantId || expectedTenantId !== actualTenantId) {
      throw new ForbiddenException({
        code: 'tenant_scope_violation',
        message: 'Cross-tenant access denied'
      });
    }
  }
}
