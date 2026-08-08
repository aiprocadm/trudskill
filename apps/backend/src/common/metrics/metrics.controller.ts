import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';

import { MetricsTokenGuard } from './metrics-token.guard.js';
import { MetricsService } from './metrics.service.js';
import { renderSchedulerMetrics } from './scheduler-heartbeat.js';

@Controller()
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}

  // Заголовок `content-type: text/plain` здесь не украшение: по нему конверт API
  // понимает, что ответ отдаётся как есть (Фаза 6 Task 5 — иначе Prometheus получал
  // JSON-обёртку вокруг текста и не мог её разобрать).
  @Get('metrics')
  @UseGuards(MetricsTokenGuard)
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsSnapshot() {
    // Отметки планировщиков живут отдельным модулем (см. scheduler-heartbeat.ts —
    // там же объяснено, почему не сервисом Nest), но наружу отдаются одним ответом.
    return `${this.metrics.renderPrometheus()}${renderSchedulerMetrics()}`;
  }
}
