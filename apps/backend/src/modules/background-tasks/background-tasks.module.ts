import { Module } from '@nestjs/common';

import { BackgroundTasksController } from './background-tasks.controller.js';
import { BackgroundTasksService } from './background-tasks.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { CommunicationModule } from '../communication/communication.module.js';

/**
 * Реестр долгих операций и раздел «Фоновые задачи» (ТЗ 12.2).
 *
 * Служба экспортируется: её зовут те модули, которые эти операции ставят в очередь.
 */
@Module({
  imports: [InfrastructureModule, CommunicationModule],
  controllers: [BackgroundTasksController],
  providers: [BackgroundTasksService],
  exports: [BackgroundTasksService]
})
export class BackgroundTasksModule {}
