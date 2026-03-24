import { Global, Module } from '@nestjs/common';
import { AppLogger } from '../../common/logging/logger.service.js';

@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger]
})
export class CoreModule {}
