import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';

import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';
import { verifySignedAccessToken } from '../../modules/iam/crypto.util.js';
import { resolveRequestContext } from '../utils/request.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly secretsService = new SecretsService()) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const requestContext = resolveRequestContext(request);
    const authHeader = request.header('authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (token) {
      try {
        const claims = verifySignedAccessToken(token, this.secretsService.getJwtSigningSecret());
        requestContext.userId = claims.sub;
        requestContext.tenantId = claims.tenant_id;
        requestContext.sessionId = claims.session_id;
        requestContext.roles = claims.roles;
        if (
          requestContext.requestedTenantId &&
          requestContext.requestedTenantId !== claims.tenant_id
        ) {
          throw new UnauthorizedException({
            code: 'tenant_mismatch',
            message: 'Tenant header does not match access token'
          });
        }
        return true;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException({
          code: 'invalid_token',
          message: 'Access token is invalid or expired'
        });
      }
    }

    const requestPath: string = request.route?.path ?? request.path ?? request.url ?? '';
    const isTenantBootstrapRoute =
      requestPath.endsWith('/auth/login') || requestPath.endsWith('/auth/refresh');
    if (isTenantBootstrapRoute && requestContext.requestedTenantId) {
      requestContext.tenantId = requestContext.requestedTenantId;
      return true;
    }

    if (!requestContext.tenantId || !requestContext.userId) {
      throw new UnauthorizedException({
        code: 'auth_required',
        message: 'Valid bearer token is required'
      });
    }

    return true;
  }
}
