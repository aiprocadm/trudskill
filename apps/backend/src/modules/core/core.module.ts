import { Global, Module } from '@nestjs/common';
import { AppLogger } from '../../common/logging/logger.service.js';
import { RealtimeEventsService } from './realtime-events.service.js';

@Global()
@Module({
  providers: [AppLogger, RealtimeEventsService],
  exports: [AppLogger, RealtimeEventsService]
})
export class CoreModule {}
