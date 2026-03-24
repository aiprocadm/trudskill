import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { PermissionGuard } from './permission.guard.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [IamService, AuthService, PermissionGuard],
  exports: [IamService, AuthService]
})
export class IamModule {}
