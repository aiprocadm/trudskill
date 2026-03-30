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
});
