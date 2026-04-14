import { Global, Module } from '@nestjs/common';

import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Global()
@Module({
  imports: [InfrastructureModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService]
})
export class AuditModule {}
