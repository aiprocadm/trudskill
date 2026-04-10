import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Put,
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
import { RequirePermissions } from './permission.decorator.js';
import { PermissionGuard } from './permission.guard.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { Session, SessionPublicDto } from './iam.types.js';
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
    authCookie.attachRefreshCookie(response, tokens.refreshToken);
    return authCookie.toPublicTokens(tokens);
  }

  @Post('auth/refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(
    @CurrentContext() context: RequestContext,
    @Body() _payload: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const refreshToken = authCookie.readRefreshCookie(request.headers);
    if (!refreshToken) {
      authCookie.clearRefreshCookie(response);
      throw new UnauthorizedException({
        code: 'invalid_refresh',
        message: 'Invalid refresh token'
      });
    }
    const tokens = await this.authService.refresh(context.tenantId!, refreshToken, context);
    authCookie.attachRefreshCookie(response, tokens.refreshToken);
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
      authCookie.clearRefreshCookie(response);
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
      authCookie.clearRefreshCookie(response);
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
    return sessions.map((session) => this.toPublicSession(session));
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
  async users(@CurrentContext() context: RequestContext) {
    const items = await this.iamService.listUsers(context.tenantId!);
    return {
      items: this.iamService.toPublicUsers(items),
      page: 1,
      pageSize: 100,
      total: items.length
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
    const user = await this.iamService.createUser(context.tenantId!, payload);
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

  private toPublicSession(session: Session): SessionPublicDto {
    return {
      id: session.id,
      tenantId: session.tenantId,
      userId: session.userId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt
    };
  }
}
