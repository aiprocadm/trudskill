import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { PermissionGuard } from './permission.guard.js';
import { AuthModule } from './modules/auth.module.js';
import { PermissionsModule } from './modules/permissions.module.js';
import { RolesModule } from './modules/roles.module.js';
import { SessionsModule } from './modules/sessions.module.js';
import { UsersModule } from './modules/users.module.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';

@Module({
  imports: [AuditModule, AuthModule, UsersModule, RolesModule, PermissionsModule, SessionsModule],
  controllers: [AuthController],
  providers: [IamService, AuthService, PermissionGuard],
  exports: [IamService, AuthService]
})
export class IamModule {}
