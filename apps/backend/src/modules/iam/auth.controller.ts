import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import QRCode from 'qrcode';

import { authCookie } from './auth-cookie.util.js';
// ВАЖНО: значения, а не `import type`. Классы форм используются как тип
// параметра @Body(), и компилятор кладёт этот тип в метаданные, по которым
// работает проверка данных. При импорте «только типом» биндинг стирается,
// в метаданных оказывается Function, и проверка отвергает ЛЮБЫЕ поля
// («property … should not exist»). Под tsx не проявлялось: esbuild метаданные
// не эмитит, и проверка просто пропускалась.
import {
  CreateUserDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  SetUserRolesDto,
  UpdateUserDto
} from './dto/login.dto.js';
import { MagicLinkRedeemDto, MagicLinkRequestDto } from './dto/magic-link.dto.js';
import { TotpCodeDto, TotpVerifyDto } from './dto/totp.dto.js';
import { toSessionResponse } from './iam-response.mapper.js';
import { RequirePermissions } from './permission.decorator.js';
import { PermissionGuard } from './permission.guard.js';
import { AuthService, TotpChallengeRequired } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import {
  MAGIC_LINK_EMAIL_SENDER,
  type MagicLinkEmailSender
} from './services/magic-link-email-sender.js';
import { MagicLinkInvalidError, MagicLinkService } from './services/magic-link.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { Request, Response } from 'express';

@Controller()
@UseGuards(TenantGuard)
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(IamService)
    private readonly iamService: IamService,
    @Inject(MagicLinkService)
    private readonly magicLinkService: MagicLinkService,
    @Inject(MAGIC_LINK_EMAIL_SENDER)
    private readonly magicLinkEmailSender: MagicLinkEmailSender
  ) {}

  @Post('auth/login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 25, ttl: 60_000 } })
  async login(
    @CurrentContext() context: RequestContext,
    @Body() payload: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const loginPayload = payload ?? (request.body as LoginDto | undefined);
    if (!loginPayload) {
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: 'Invalid credentials'
      });
    }
    try {
      const tokens = await this.authService.login(context.tenantId!, loginPayload, context);
      authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
      return authCookie.toPublicTokens(tokens);
    } catch (err) {
      if (err instanceof TotpChallengeRequired) {
        // Пароль верный, но включена 2FA: сессии ещё нет — клиент идёт на /auth/2fa/verify.
        return { totpRequired: true as const, challengeToken: err.challengeToken };
      }
      throw err;
    }
  }

  /**
   * Второй шаг логина (ФТ-G3). Bootstrap-роут: bearer-токена ещё нет, тенант приходит
   * заголовком x-tenant-id (см. isTenantBootstrapRoute в TenantGuard). Жёсткий лимит —
   * перебор 6-значного кода в 5-минутном окне challenge должен быть невозможен.
   */
  @Post('auth/2fa/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyTotp(
    @CurrentContext() context: RequestContext,
    @Body() payload: TotpVerifyDto,
    @Res({ passthrough: true }) response: Response
  ) {
    if (!context.tenantId) {
      throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
    }
    const tokens = await this.authService.verifyTotpAndLogin(
      context.tenantId,
      payload.challengeToken,
      payload.code,
      context
    );
    authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
    return authCookie.toPublicTokens(tokens);
  }

  /** Самообслуживание 2FA (авторизованный пользователь; роли — внутри сервиса). */
  @Get('auth/2fa/status')
  async totpStatus(@CurrentContext() context: RequestContext) {
    return this.authService.getTotpStatus(context.tenantId!, context.userId!);
  }

  @Post('auth/2fa/setup')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async setupTotp(@CurrentContext() context: RequestContext) {
    const { secret, otpauthUrl } = await this.authService.setupTotp(
      context.tenantId!,
      context.userId!,
      context
    );
    // QR рисуем на бэке (data-URI): фронт остаётся без QR-зависимостей.
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
    return { secret, otpauthUrl, qrDataUrl };
  }

  @Post('auth/2fa/confirm')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirmTotp(@CurrentContext() context: RequestContext, @Body() payload: TotpCodeDto) {
    return this.authService.confirmTotp(context.tenantId!, context.userId!, payload.code, context);
  }

  @Post('auth/2fa/disable')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async disableTotp(@CurrentContext() context: RequestContext, @Body() payload: TotpCodeDto) {
    return this.authService.disableTotp(context.tenantId!, context.userId!, payload.code, context);
  }

  @Post('auth/magic-link/request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestMagicLink(
    @CurrentContext() context: RequestContext,
    @Body() payload: MagicLinkRequestDto
  ): Promise<{ status: 'sent' }> {
    if (!context.tenantId) {
      throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
    }

    const { rawToken } = await this.magicLinkService.requestLink({
      tenantId: context.tenantId,
      email: payload.email,
      ip: context.ip,
      userAgent: context.userAgent
    });
    await this.magicLinkEmailSender.sendMagicLink({ email: payload.email, rawToken });

    return { status: 'sent' };
  }

  @Post('auth/magic-link/redeem')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async redeemMagicLink(
    @CurrentContext() context: RequestContext,
    @Body() payload: MagicLinkRedeemDto,
    @Res({ passthrough: true }) response: Response
  ) {
    if (!context.tenantId) {
      throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
    }

    try {
      const { email } = await this.magicLinkService.peekEmail({
        tenantId: context.tenantId,
        rawToken: payload.token
      });

      const { user, databaseBacked } = await this.iamService.findOrCreateByEmail(
        context.tenantId,
        email
      );

      await this.magicLinkService.redeemLink({
        tenantId: context.tenantId,
        rawToken: payload.token,
        userId: user.id,
        ip: context.ip,
        userAgent: context.userAgent
      });

      const tokens = await this.authService.issueSessionForUser(user, context, {
        authMethod: 'magic_link',
        databaseBacked
      });

      authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
      return authCookie.toPublicTokens(tokens);
    } catch (err) {
      if (err instanceof TotpChallengeRequired) {
        // ФТ-G3: magic-link не обходит 2FA — ссылка погашена, но сессия только после кода.
        return { totpRequired: true as const, challengeToken: err.challengeToken };
      }
      if (err instanceof MagicLinkInvalidError) {
        throw new UnauthorizedException({
          code: 'invalid_magic_link',
          message: 'Magic link is invalid or expired'
        });
      }
      throw err;
    }
  }

  @Get('auth/csrf')
  async csrf(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const csrfToken = authCookie.readCsrfCookie(request.headers);
    if (!csrfToken) {
      throw new UnauthorizedException({ code: 'missing_csrf', message: 'CSRF token is missing' });
    }
    authCookie.attachCsrfCookie(response, csrfToken);
    return { csrfToken };
  }

  @Post('auth/refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(
    @CurrentContext() context: RequestContext,
    @Body() _payload: RefreshDto,
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeaderToken: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    const refreshToken = authCookie.readRefreshCookie(request.headers);
    const csrfCookieToken = authCookie.readCsrfCookie(request.headers);
    if (!csrfHeaderToken || !csrfCookieToken || csrfHeaderToken !== csrfCookieToken) {
      authCookie.clearAuthCookies(response);
      throw new UnauthorizedException({ code: 'invalid_csrf', message: 'Invalid CSRF token' });
    }
    if (!refreshToken) {
      authCookie.clearAuthCookies(response);
      throw new UnauthorizedException({
        code: 'invalid_refresh',
        message: 'Invalid refresh token'
      });
    }
    const tokens = await this.authService.refresh(
      context.tenantId!,
      refreshToken,
      csrfHeaderToken,
      context
    );
    authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
    return authCookie.toPublicTokens(tokens);
  }

  @Post('auth/logout')
  async logout(
    @CurrentContext() context: RequestContext,
    @Body() payload: LogoutDto,
    @Res({ passthrough: true }) response: Response
  ) {
    try {
      await this.authService.logout(context.tenantId!, context.userId!, payload.sessionId, context);
      return { success: true };
    } finally {
      authCookie.clearAuthCookies(response);
    }
  }

  @Post('auth/logout-all')
  async logoutAll(
    @CurrentContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response
  ) {
    try {
      await this.authService.logoutAll(context.tenantId!, context.userId!, context);
      return { success: true };
    } finally {
      authCookie.clearAuthCookies(response);
    }
  }

  @Get('auth/me')
  async me(@CurrentContext() context: RequestContext) {
    const user = await this.iamService.getUser(context.tenantId!, context.userId!);
    // §5.160: resolve permissions server-side (the SSOT — iam.role_permissions) and return them
    // so the frontend stops deriving them from a hand-maintained static map that drifted out of
    // sync with backend role grants (admins were silently denied ~20 nav sections).
    const permissions = await this.iamService.resolvePermissions(
      context.tenantId!,
      context.userId!
    );
    return { ...this.iamService.toPublicUser(user), permissions };
  }

  @Get('auth/sessions')
  async sessions(@CurrentContext() context: RequestContext) {
    const sessions = await this.authService.listSessions(context.tenantId!, context.userId!);
    return sessions.map((session) => toSessionResponse(session));
  }

  @Delete('auth/sessions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('auth.manage_sessions')
  async revoke(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    await this.authService.revokeSession(context.tenantId!, context.userId!, id, context);
    return { success: true };
  }

  @Get('roles')
  async roles(@CurrentContext() context: RequestContext) {
    return this.iamService.getRoles(context.tenantId!);
  }

  @Get('permissions')
  async permissions() {
    return this.iamService.getPermissions();
  }

  @Get('users')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  async users(
    @CurrentContext() context: RequestContext,
    @Query('q') q?: string,
    @Query('status') status?: 'active' | 'blocked',
    @Query('page') page = '1',
    @Query('page_size') pageSize = '20',
    @Query('sort') sort?: string
  ) {
    const result = await this.iamService.listUsers(context.tenantId!, {
      q,
      status,
      sort,
      page: Number(page),
      pageSize: Number(pageSize)
    });
    return {
      items: this.iamService.toPublicUsers(result.items),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total
    };
  }

  @Get('users/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  async user(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    const user = await this.iamService.getUser(context.tenantId!, id);
    return this.iamService.toPublicUser(user);
  }

  @Post('users')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  async createUser(@CurrentContext() context: RequestContext, @Body() payload: CreateUserDto) {
    const user = await this.iamService.createUser(context.tenantId!, payload, {
      actorId: context.userId,
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    return this.iamService.toPublicUser(user);
  }

  @Put('users/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  async updateUser(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body() payload: UpdateUserDto
  ) {
    const user = await this.iamService.updateUser(context.tenantId!, id, payload);
    return this.iamService.toPublicUser(user);
  }

  @Get('users/:id/roles')
  async userRoles(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    if (context.userId !== id) {
      const resolved = await this.iamService.resolvePermissions(context.tenantId!, context.userId!);
      if (!resolved.includes('iam.manage_roles')) {
        throw new ForbiddenException({ code: 'permission_denied', message: 'Permission denied' });
      }
    }
    return this.iamService.getUserRoles(context.tenantId!, id);
  }

  @Put('users/:id/roles')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  async setRoles(
    @CurrentContext() context: RequestContext,
    @Param('id') id: string,
    @Body() payload: SetUserRolesDto
  ) {
    return this.iamService.setUserRoles(
      context.tenantId!,
      id,
      payload.roleCodes,
      context.userId,
      context.requestId,
      context.correlationId
    );
  }
}
