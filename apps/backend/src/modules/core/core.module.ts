import { Global, Module } from '@nestjs/common';
import { AppLogger } from '../../common/logging/logger.service.js';
import { MetricsController } from '../../common/metrics/metrics.controller.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { RealtimeEventsService } from './realtime-events.service.js';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [AppLogger, MetricsService, RealtimeEventsService],
  exports: [AppLogger, MetricsService, RealtimeEventsService]
})
export class CoreModule {}
