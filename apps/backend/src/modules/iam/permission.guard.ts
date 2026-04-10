import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';

import { REQUIRED_PERMISSIONS } from './permission.decorator.js';
import { type AuthService } from './services/auth.service.js';
import { type IamService } from './services/iam.service.js';
import { resolveRequestContext } from '../../common/utils/request.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly iamService: IamService,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const requestContext = resolveRequestContext(request);

    if (!requestContext.userId || !requestContext.tenantId) {
      throw new ForbiddenException({ code: 'auth_required', message: 'Authentication required' });
    }

    const sessionId = requestContext.sessionId;
    if (!sessionId || !(await this.authService.isSessionActive(requestContext.tenantId, requestContext.userId, sessionId))) {
      throw new ForbiddenException({ code: 'session_inactive', message: 'Session is inactive or revoked' });
    }

    const resolved = await this.iamService.resolvePermissions(requestContext.tenantId, requestContext.userId);
    const hasAll = required.every((permission) => resolved.includes(permission));
    if (!hasAll) {
      throw new ForbiddenException({ code: 'permission_denied', message: 'Permission denied' });
    }

    return true;
  }
}
