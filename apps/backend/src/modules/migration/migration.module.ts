import { Module } from '@nestjs/common';

import { BackfillController } from './backfill/backfill.controller.js';
import { BackfillService } from './backfill/backfill.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { WorkerCallbackGuard } from '../mvp/infrastructure/worker-callback.guard.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [BackfillController],
  providers: [BackfillService, WorkerCallbackGuard],
  exports: [BackfillService]
})
export class MigrationModule {}
