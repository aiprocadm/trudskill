import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [HealthController],
  // Готовность попутно публикует глубину очередей как метрику (Фаза 6 Task 6),
  // поэтому сервис метрик нужен модулю явно.
  providers: [MetricsService]
})
export class HealthModule {}
