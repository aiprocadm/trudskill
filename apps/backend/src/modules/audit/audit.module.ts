import { Global, Module } from '@nestjs/common';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditService } from './audit.service.js';

@Global()
@Module({
  imports: [InfrastructureModule],
  providers: [AuditService],
  exports: [AuditService]
})
export class AuditModule {}
