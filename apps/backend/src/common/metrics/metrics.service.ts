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

    /*
     * Перцентили, а не только среднее (Фаза 6 Task 5).
     *
     * Требование ТЗ §12.1 звучит как «p95 списков меньше 300 мс» — по среднему его
     * проверить нельзя в принципе: среднее прячет как раз те запросы, из-за которых
     * люди жалуются. Замеры уже копятся (последняя тысяча на маршрут), не хватало
     * только расчёта.
     */
    lines.push('# HELP http_request_duration_ms Quantiles of HTTP request duration');
    lines.push('# TYPE http_request_duration_ms summary');
    for (const [key, values] of this.durationBuckets) {
      const [method, route] = key.split(':');
      if (!values.length) continue;
      const labels = `method="${method}",route="${route}"`;
      for (const q of [0.5, 0.95, 0.99]) {
        lines.push(
          `http_request_duration_ms{${labels},quantile="${q}"} ${this.percentile(values, q).toFixed(2)}`
        );
      }
      lines.push(`http_request_duration_ms_count{${labels}} ${values.length}`);
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

  /**
   * Лейблы, которые нельзя класть в метрики (Фаза 6 Task 5).
   *
   * Каждое новое значение лейбла — это отдельный временной ряд, который сборщик хранит
   * вечно. Идентификатор центра, пользователя или слушателя даёт столько рядов, сколько
   * их вообще есть в системе: на арендной платформе это неограниченный рост памяти
   * сборщика. Разбивка по центрам — задача экрана «Здоровье арендаторов», а не метрик.
   *
   * ВАЖНО для тех, кто пишет новые метрики: если лейбл отсеян, отчитывайтесь СУММОЙ по
   * всем центрам. Иначе на общий ряд будут писать несколько источников, и в датчике
   * останется значение последнего.
   */
  private static readonly HIGH_CARDINALITY_LABELS = new Set([
    'tenant_id',
    'tenantId',
    'user_id',
    'userId',
    'learner_id',
    'learnerId',
    'enrollment_id',
    'document_id'
  ]);

  /**
   * Перцентиль по накопленным замерам. Метод «ближайшего ранга»: без интерполяции,
   * зато значение всегда равно одному из реально измеренных — на выборке в тысячу
   * замеров разница с интерполяцией меньше, чем разброс самих измерений.
   */
  private percentile(values: number[], quantile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
    return sorted[index] ?? 0;
  }

  private seriesKey(name: string, labels: Record<string, string>) {
    const normalized = Object.fromEntries(
      Object.entries(labels)
        .filter(([k]) => !MetricsService.HIGH_CARDINALITY_LABELS.has(k))
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
