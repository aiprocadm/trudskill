import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [HealthController]
})
export class HealthModule {}
