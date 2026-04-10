import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Global()
@Module({
  imports: [InfrastructureModule],
  providers: [AuditService],
  exports: [AuditService]
})
export class AuditModule {}
