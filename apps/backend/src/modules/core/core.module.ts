import { Global, Module } from '@nestjs/common';

import { RealtimeEventsService } from './realtime-events.service.js';
import { AppLogger } from '../../common/logging/logger.service.js';
import { MetricsController } from '../../common/metrics/metrics.controller.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [AppLogger, MetricsService, RealtimeEventsService],
  exports: [AppLogger, MetricsService, RealtimeEventsService]
})
export class CoreModule {}
