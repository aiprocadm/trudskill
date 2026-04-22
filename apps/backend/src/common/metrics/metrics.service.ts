import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly requestCounters = new Map<string, number>();
  private readonly durationBuckets = new Map<string, number[]>();

  private readonly customCounters = new Map<string, number>();
  private readonly customCounterMeta = new Map<
    string,
    { name: string; labels: Record<string, string> }
  >();

  private readonly customDurationBuckets = new Map<string, number[]>();
  private readonly customDurationMeta = new Map<
    string,
    { name: string; labels: Record<string, string> }
  >();
  private readonly customGauges = new Map<string, number>();
  private readonly customGaugeMeta = new Map<
    string,
    { name: string; labels: Record<string, string> }
  >();

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

  incrementCounter(name: string, labels: Record<string, string> = {}) {
    const { key, normalized } = this.seriesKey(name, labels);
    this.customCounterMeta.set(key, { name, labels: normalized });
    this.customCounters.set(key, (this.customCounters.get(key) ?? 0) + 1);
  }

  observeDuration(name: string, durationMs: number, labels: Record<string, string> = {}) {
    const { key, normalized } = this.seriesKey(name, labels);
    this.customDurationMeta.set(key, { name, labels: normalized });
    const durations = this.customDurationBuckets.get(key) ?? [];
    durations.push(durationMs);
    this.customDurationBuckets.set(key, durations.slice(-1000));
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}) {
    const { key, normalized } = this.seriesKey(name, labels);
    this.customGaugeMeta.set(key, { name, labels: normalized });
    this.customGauges.set(key, value);
  }

  observeQueueLag(lagMs: number, labels: Record<string, string> = {}) {
    this.observeDuration('queue_lag_ms', lagMs, labels);
  }

  incrementJobRetry(labels: Record<string, string> = {}) {
    this.incrementCounter('job_retries_total', labels);
  }

  setDlqSize(size: number, labels: Record<string, string> = {}) {
    this.setGauge('dlq_size', size, labels);
  }

  incrementAuthFailure(labels: Record<string, string> = {}) {
    this.incrementCounter('auth_failures_total', labels);
  }

  incrementDocumentGenerationFailure(labels: Record<string, string> = {}) {
    this.incrementCounter('document_generation_failures_total', labels);
  }

  renderPrometheus() {
    const lines = [
      '# HELP http_requests_total Total HTTP requests',
      '# TYPE http_requests_total counter'
    ];

    for (const [key, value] of this.requestCounters) {
      const [method, route, status] = key.split(':');
      lines.push(
        `http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`
      );
    }

    lines.push('# HELP http_active_requests Active HTTP requests');
    lines.push('# TYPE http_active_requests gauge');
    lines.push(`http_active_requests ${this.activeRequests}`);

    lines.push('# HELP http_request_duration_ms_avg Average HTTP request duration');
    lines.push('# TYPE http_request_duration_ms_avg gauge');

    for (const [key, values] of this.durationBuckets) {
      const [method, route] = key.split(':');
      const avg = values.length ? values.reduce((acc, curr) => acc + curr, 0) / values.length : 0;
      lines.push(
        `http_request_duration_ms_avg{method="${method}",route="${route}"} ${avg.toFixed(2)}`
      );
    }

    this.renderCustomCounters(lines);
    this.renderCustomDurations(lines);
    this.renderCustomGauges(lines);

    return `${lines.join('\n')}\n`;
  }

  private renderCustomCounters(lines: string[]) {
    const announced = new Set<string>();
    for (const [key, value] of this.customCounters) {
      const meta = this.customCounterMeta.get(key);
      if (!meta) continue;
      if (!announced.has(meta.name)) {
        lines.push(`# HELP ${meta.name} Custom counter ${meta.name}`);
        lines.push(`# TYPE ${meta.name} counter`);
        announced.add(meta.name);
      }
      lines.push(`${meta.name}${this.labelSet(meta.labels)} ${value}`);
    }
  }

  private renderCustomDurations(lines: string[]) {
    const announced = new Set<string>();
    for (const [key, values] of this.customDurationBuckets) {
      const meta = this.customDurationMeta.get(key);
      if (!meta) continue;
      if (!announced.has(meta.name)) {
        lines.push(`# HELP ${meta.name} Custom duration metric ${meta.name}`);
        lines.push(`# TYPE ${meta.name} gauge`);
        announced.add(meta.name);
      }
      const avg = values.length ? values.reduce((acc, curr) => acc + curr, 0) / values.length : 0;
      lines.push(`${meta.name}${this.labelSet(meta.labels)} ${avg.toFixed(2)}`);
    }
  }

  private renderCustomGauges(lines: string[]) {
    const announced = new Set<string>();
    for (const [key, value] of this.customGauges) {
      const meta = this.customGaugeMeta.get(key);
      if (!meta) continue;
      if (!announced.has(meta.name)) {
        lines.push(`# HELP ${meta.name} Custom gauge metric ${meta.name}`);
        lines.push(`# TYPE ${meta.name} gauge`);
        announced.add(meta.name);
      }
      lines.push(`${meta.name}${this.labelSet(meta.labels)} ${value}`);
    }
  }

  private seriesKey(name: string, labels: Record<string, string>) {
    const normalized = Object.fromEntries(
      Object.entries(labels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, String(v)])
    );
    return { key: `${name}|${JSON.stringify(normalized)}`, normalized };
  }

  private labelSet(labels: Record<string, string>) {
    const entries = Object.entries(labels);
    if (!entries.length) return '';
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
  }
}
