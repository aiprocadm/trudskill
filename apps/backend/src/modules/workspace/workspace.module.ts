import { Module } from '@nestjs/common';

import { WorkspaceController } from './workspace.controller.js';
import { WorkspaceService } from './workspace.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { PermissionGuard } from '../iam/permission.guard.js';
import { AuthService } from '../iam/services/auth.service.js';
import { IamService } from '../iam/services/iam.service.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, PermissionGuard, IamService, AuthService]
})
export class WorkspaceModule {}
