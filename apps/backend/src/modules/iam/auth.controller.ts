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

import { authCookie } from './auth-cookie.util.js';
import {
  type CreateUserDto,
  type LoginDto,
  type LogoutDto,
  type RefreshDto,
  type SetUserRolesDto,
  type UpdateUserDto
} from './dto/login.dto.js';
import { toSessionResponse } from './iam-response.mapper.js';
import { RequirePermissions } from './permission.decorator.js';
import { PermissionGuard } from './permission.guard.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
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
    private readonly iamService: IamService
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
    const tokens = await this.authService.login(context.tenantId!, loginPayload, context);
    authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
    return authCookie.toPublicTokens(tokens);
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
    return this.iamService.toPublicUser(user);
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
      requestId: context.requestId
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
      context.requestId
    );
  }
}
