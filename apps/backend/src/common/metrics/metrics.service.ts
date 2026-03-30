import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly requestCounters = new Map<string, number>();
  private readonly durationBuckets = new Map<string, number[]>();
  private activeRequests = 0;

  trackRequestStart() {
    this.activeRequests += 1;
  }

  trackRequestEnd(route: string, method: string, statusCode: number, durationMs: number) {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    const key = `${method}:${route}:${statusCode}`;
    this.requestCounters.set(key, (this.requestCounters.get(key) ?? 0) + 1);

    const durationKey = `${method}:${route}`;
    const durations = this.durationBuckets.get(durationKey) ?? [];
    durations.push(durationMs);
    this.durationBuckets.set(durationKey, durations.slice(-1000));
  }

  renderPrometheus() {
    const lines = [
      '# HELP http_requests_total Total HTTP requests',
      '# TYPE http_requests_total counter'
    ];

    for (const [key, value] of this.requestCounters) {
      const [method, route, status] = key.split(':');
      lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`);
    }

    lines.push('# HELP http_active_requests Active HTTP requests');
    lines.push('# TYPE http_active_requests gauge');
    lines.push(`http_active_requests ${this.activeRequests}`);

    lines.push('# HELP http_request_duration_ms_avg Average HTTP request duration');
    lines.push('# TYPE http_request_duration_ms_avg gauge');

    for (const [key, values] of this.durationBuckets) {
      const [method, route] = key.split(':');
      const avg = values.length ? values.reduce((acc, curr) => acc + curr, 0) / values.length : 0;
      lines.push(`http_request_duration_ms_avg{method="${method}",route="${route}"} ${avg.toFixed(2)}`);
    }

    return `${lines.join('\n')}\n`;
  }
}
