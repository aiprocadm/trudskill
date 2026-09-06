import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRED_PERMISSIONS } from './permission.decorator.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { resolveRequestContext } from '../../common/utils/request.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IamService) private readonly iamService: IamService,
    @Inject(AuthService) private readonly authService: AuthService
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
      // Сессии нет вовсе — это «войдите», а не «вам сюда нельзя»: код и статус говорят одно.
      throw new UnauthorizedException({
        code: 'auth_required',
        message: 'Authentication required'
      });
    }

    const sessionId = requestContext.sessionId;
    if (
      !sessionId ||
      !(await this.authService.isSessionActive(
        requestContext.tenantId,
        requestContext.userId,
        sessionId
      ))
    ) {
      throw new ForbiddenException({
        code: 'session_inactive',
        message: 'Session is inactive or revoked'
      });
    }

    const scope = await this.iamService.resolveActorScope(
      requestContext.tenantId,
      requestContext.userId
    );
    const resolved = scope.permissions;
    requestContext.permissions = resolved;
    // ФТ-E5: привязка представителя к контрагенту — основание скоупа выборок портала.
    // Ставится из личности актора, а не из параметров запроса: те подменяются.
    if (scope.counterpartyId) {
      requestContext.counterpartyId = scope.counterpartyId;
    }

    const hasAll = required.every((permission) => resolved.includes(permission));
    if (!hasAll) {
      throw new ForbiddenException({ code: 'permission_denied', message: 'Permission denied' });
    }

    return true;
  }
}
