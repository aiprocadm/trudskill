import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [HealthController]
  /*
   * `MetricsService` СЮДА НЕ ДОБАВЛЯТЬ (найдено на стенде 2026-08-10).
   *
   * Он раздаётся глобально из `CoreModule`. Если прописать его здесь ещё раз, Nest создаст
   * модулю ОТДЕЛЬНЫЙ экземпляр: готовность будет писать глубину очереди в него, а ручка
   * `/metrics` — читать из глобального, и метрика молча не появится наружу. Ошибок при
   * этом нет, тесты зелёные — беда тихая. Закреплено `metrics-single-instance.test.ts`.
   */
})
export class HealthModule {}
