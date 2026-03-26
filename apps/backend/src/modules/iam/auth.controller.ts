import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import type { RequestContext } from '../../common/context/request-context.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from './permission.decorator.js';
import { PermissionGuard } from './permission.guard.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { CreateUserDto, LoginDto, LogoutDto, RefreshDto, SetUserRolesDto, UpdateUserDto } from './dto/login.dto.js';

@Controller()
@UseGuards(TenantGuard)
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly iamService: IamService) {}

  @Post('auth/login')
  login(@CurrentContext() context: RequestContext, @Body() payload: LoginDto) {
    return this.authService.login(context.tenantId!, payload, context);
  }

  @Post('auth/refresh')
  refresh(@CurrentContext() context: RequestContext, @Body() payload: RefreshDto) {
    return this.authService.refresh(context.tenantId!, payload.refreshToken, context);
  }

  @Post('auth/logout')
  logout(@CurrentContext() context: RequestContext, @Body() payload: LogoutDto) {
    this.authService.logout(context.tenantId!, context.userId!, payload.sessionId, context);
    return { success: true };
  }

  @Post('auth/logout-all')
  logoutAll(@CurrentContext() context: RequestContext) {
    this.authService.logoutAll(context.tenantId!, context.userId!, context);
    return { success: true };
  }

  @Get('auth/me')
  me(@CurrentContext() context: RequestContext) {
    return this.iamService.getUser(context.tenantId!, context.userId!);
  }

  @Get('auth/sessions')
  sessions(@CurrentContext() context: RequestContext) {
    return this.authService.listSessions(context.tenantId!, context.userId!);
  }

  @Delete('auth/sessions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('auth.manage_sessions')
  revoke(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    this.authService.revokeSession(context.tenantId!, context.userId!, id, context);
    return { success: true };
  }

  @Get('roles')
  roles(@CurrentContext() context: RequestContext) {
    return this.iamService.getRoles(context.tenantId!);
  }

  @Get('permissions')
  permissions() {
    return this.iamService.getPermissions();
  }


  @Get('users')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  users(@CurrentContext() context: RequestContext) {
    return { items: this.iamService.listUsers(context.tenantId!), page: 1, pageSize: 100, total: this.iamService.listUsers(context.tenantId!).length };
  }

  @Get('users/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  user(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return this.iamService.getUser(context.tenantId!, id);
  }

  @Post('users')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  createUser(@CurrentContext() context: RequestContext, @Body() payload: CreateUserDto) {
    return this.iamService.createUser(context.tenantId!, payload);
  }

  @Put('users/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  updateUser(@CurrentContext() context: RequestContext, @Param('id') id: string, @Body() payload: UpdateUserDto) {
    return this.iamService.updateUser(context.tenantId!, id, payload);
  }

  @Get('users/:id/roles')
  userRoles(@CurrentContext() context: RequestContext, @Param('id') id: string) {
    return this.iamService.getUserRoles(context.tenantId!, id);
  }

  @Put('users/:id/roles')
  @UseGuards(PermissionGuard)
  @RequirePermissions('iam.manage_roles')
  setRoles(
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
