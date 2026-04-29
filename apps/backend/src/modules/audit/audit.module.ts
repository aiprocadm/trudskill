import { Global, Module, forwardRef } from '@nestjs/common';

import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { IamModule } from '../iam/iam.module.js';

@Global()
@Module({
  imports: [InfrastructureModule, forwardRef(() => IamModule)],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService]
})
export class AuditModule {}
