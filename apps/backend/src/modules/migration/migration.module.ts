import { Module } from '@nestjs/common';

import { BackfillController } from './backfill/backfill.controller.js';
import { BackfillService } from './backfill/backfill.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [BackfillController],
  providers: [BackfillService],
  exports: [BackfillService]
})
export class MigrationModule {}
