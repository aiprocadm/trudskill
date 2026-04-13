import { describe, expect, it } from 'vitest';

import { MetricsService } from './metrics.service.js';

describe('metrics service', () => {
  it('renders metrics in prometheus format', () => {
    const service = new MetricsService();
    service.trackRequestStart();
    service.trackRequestEnd('/health/live', 'GET', 200, 12);

    const snapshot = service.renderPrometheus();
    expect(snapshot).toContain('http_requests_total');
    expect(snapshot).toContain('http_active_requests 0');
    expect(snapshot).toContain('route="/health/live"');
  });

  it('renders custom counters and durations', () => {
    const service = new MetricsService();
    service.incrementCounter('mvp_persistence_load_total', { backend: 'postgres', result: 'ok' });
    service.observeDuration('mvp_persistence_load_duration_ms', 15, { backend: 'postgres' });
    service.observeDuration('mvp_persistence_load_duration_ms', 25, { backend: 'postgres' });

    const snapshot = service.renderPrometheus();
    expect(snapshot).toContain('mvp_persistence_load_total{backend="postgres",result="ok"} 1');
    expect(snapshot).toContain('mvp_persistence_load_duration_ms{backend="postgres"} 20.00');
  });
});
