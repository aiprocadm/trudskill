import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException
} from '@nestjs/common';

import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';
import { verifySignedAccessToken } from '../../modules/iam/crypto.util.js';
import { resolveRequestContext } from '../utils/request.js';

@Injectable()
export class TenantGuard implements CanActivate {
  // @Inject — по правилу репозитория (см. di-explicit-injection.test.ts): под tsx
  // метаданные типов не эмитятся, поэтому внедрение «по типу» там не работает.
  //
  // @Optional — потому что SecretsService объявлен в InfrastructureModule и НЕ
  // глобален, а охранник применяется и в модулях, которые этот модуль не
  // импортируют. Без @Optional собранное приложение падало на старте
  // с UnknownDependenciesException. Теперь: есть в контейнере — берём оттуда,
  // нет — срабатывает значение по умолчанию, как и раньше.
  constructor(
    @Optional()
    @Inject(SecretsService)
    private readonly secretsService: SecretsService = new SecretsService()
  ) {}

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
        const headerTenant = requestContext.requestedTenantId;
        if (headerTenant && headerTenant !== claims.tenant_id) {
          throw new BadRequestException({
            code: 'tenant_header_mismatch',
            message: 'x-tenant-id does not match the tenant in the access token'
          });
        }
        requestContext.userId = claims.sub;
        requestContext.tenantId = claims.tenant_id;
        requestContext.sessionId = claims.session_id;
        requestContext.roles = claims.roles;
        return true;
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        throw new UnauthorizedException({
          code: 'invalid_token',
          message: 'Access token is invalid or expired'
        });
      }
    }

    // SECURITY: prefer the matched route pattern; fall back to the URL path with the
    // query string stripped. `request.url` carries the query, and an attacker can stuff
    // `/auth/esia/` or `/auth/login` into it (e.g. `?redirect=/auth/esia/cb`). The
    // unauthenticated bypass decision below must depend on the PATH only, never the query.
    const requestPath: string = (request.route?.path ?? request.path ?? request.url ?? '').split(
      '?'
    )[0];
    const isTenantBootstrapRoute =
      requestPath.endsWith('/auth/login') ||
      requestPath.endsWith('/auth/refresh') ||
      // Первый шаг восстановления сессии после перезагрузки страницы (F5): фронт делает
      // GET /auth/csrf, чтобы получить пару к csrf-cookie, и только потом POST /auth/refresh.
      // Bearer'а на этом шаге ещё нет — без bootstrap'а восстановление падало всегда.
      // Лишнего ручка не открывает: она лишь возвращает значение уже пришедшей cookie,
      // а без неё сама бросает 401.
      requestPath.endsWith('/auth/csrf') ||
      // Второй шаг 2FA-логина (ФТ-G3): bearer-токена ещё нет, авторизует подписанный
      // challenge в теле запроса; сравнение по PATH — как и у остальных bootstrap-роутов.
      requestPath.endsWith('/auth/2fa/verify') ||
      // Ревизия 2026-08-27 (порция 23, журнал 268): вход по ссылке на почту довходной
      // ПО ОПРЕДЕЛЕНИЮ — bearer'а на форме входа нет. Без этих двух строк запрос
      // отбивался 401 ещё до контроллера, и письмо не уходило никогда (ровно этот
      // класс уже чинили для /auth/csrf). Redeem авторизует одноразовый токен из
      // письма, а блокировку пользователя проверяет единый гейт issueSessionForUser.
      requestPath.endsWith('/auth/magic-link/request') ||
      requestPath.endsWith('/auth/magic-link/redeem');
    if (isTenantBootstrapRoute && requestContext.requestedTenantId) {
      requestContext.tenantId = requestContext.requestedTenantId;
      return true;
    }

    const isEsiaAuthRoute = requestPath.includes('/auth/esia/');
    if (isEsiaAuthRoute) {
      // ЕСИА OAuth entry/callback are browser navigations: tenant + (for identity) learner travel
      // inside the signed `state`; the controller/service resolve them. No bearer/x-tenant-id here.
      if (requestContext.requestedTenantId)
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
