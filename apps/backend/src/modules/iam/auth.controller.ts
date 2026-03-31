import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import type { RequestContext } from '../../common/context/request-context.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from './permission.decorator.js';
import { PermissionGuard } from './permission.guard.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { CreateUserDto, LoginDto, LogoutDto, RefreshDto, SetUserRolesDto, UpdateUserDto } from './dto/login.dto.js';
import type { Session, SessionPublicDto } from './iam.types.js';

@Controller()
@UseGuards(TenantGuard)
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly iamService: IamService) {}

  @Post('auth/login')
  async login(@CurrentContext() context: RequestContext, @Body() payload: LoginDto) {
    return this.authService.login(context.tenantId!, payload, context);
  }

  @Post('auth/refresh')
  async refresh(@CurrentContext() context: RequestContext, @Body() payload: RefreshDto) {
    return this.authService.refresh(context.tenantId!, payload.refreshToken, context);
  }

  @Post('auth/logout')
  async logout(@CurrentContext() context: RequestContext, @Body() payload: LogoutDto) {
    await this.authService.logout(context.tenantId!, context.userId!, payload.sessionId, context);
    return { success: true };
  }

  @Post('auth/logout-all')
  async logoutAll(@CurrentContext() context: RequestContext) {
    await this.authService.logoutAll(context.tenantId!, context.userId!, context);
    return { success: true };
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
    return { items: this.iamService.toPublicUsers(items), page: 1, pageSize: 100, total: items.length };
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
  async updateUser(@CurrentContext() context: RequestContext, @Param('id') id: string, @Body() payload: UpdateUserDto) {
    const user = await this.iamService.updateUser(context.tenantId!, id, payload);
    return this.iamService.toPublicUser(user);
  }

  @Get('users/:id/roles')
  async userRoles(@CurrentContext() context: RequestContext, @Param('id') id: string) {
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
