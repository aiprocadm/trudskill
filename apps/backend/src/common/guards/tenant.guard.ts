import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { resolveRequestContext } from '../utils/request.js';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const requestContext = resolveRequestContext(request);

    if (!requestContext.tenantId) {
      throw new UnauthorizedException({
        code: 'tenant_missing',
        message: 'Tenant context is required'
      });
    }

    return true;
  }
}
