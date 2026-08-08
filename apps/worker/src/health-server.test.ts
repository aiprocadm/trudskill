import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHeartbeat, isAlive, renderWorkerMetrics, startIdleTicker } from './health-server.js';

/**
 * Признак жизни воркера (ФТ-I1, Фаза 6 Task 5).
 *
 * До этой правки воркер не подавал никаких признаков жизни: ни порта, ни отметок,
 * ни healthcheck в compose. Умерший воркер выглядел как живой — очередь просто копилась,
 * и узнавали об этом по звонку «где моё удостоверение».
 */
describe('живость воркера', () => {
  it('только что запущенный воркер жив', () => {
    const now = 1_000_000;
    const heartbeat = createHeartbeat(() => now);
    expect(isAlive(heartbeat, 300_000, now)).toBe(true);
  });

  it('молчание дольше порога — зависание', () => {
    const start = 1_000_000;
    const heartbeat = createHeartbeat(() => start);
    expect(isAlive(heartbeat, 300_000, start + 299_000)).toBe(true);
    expect(isAlive(heartbeat, 300_000, start + 301_000)).toBe(false);
  });

  it('обработка сообщения продлевает жизнь', () => {
    const start = 1_000_000;
    const heartbeat = createHeartbeat(() => start);
    heartbeat.lastTickAt = start + 290_000;
    expect(isAlive(heartbeat, 300_000, start + 301_000)).toBe(true);
  });
});

describe('метрики воркера', () => {
  it('отдаёт исходы по видам: обработано, повторено, в карантине', () => {
    const start = 1_000_000;
    const heartbeat = createHeartbeat(() => start);
    heartbeat.processed = 7;
    heartbeat.retried = 2;
    heartbeat.deadLettered = 1;
    heartbeat.failed = 1;

    const text = renderWorkerMetrics(heartbeat, start + 60_000);

    expect(text).toContain('worker_up 1');
    expect(text).toContain('worker_uptime_seconds 60');
    expect(text).toContain('worker_jobs_total{outcome="processed"} 7');
    expect(text).toContain('worker_jobs_total{outcome="retried"} 2');
    expect(text).toContain('worker_jobs_total{outcome="dead_lettered"} 1');
  });

  it('возраст последней активности виден отдельно — по нему ловят зависание', () => {
    const start = 1_000_000;
    const heartbeat = createHeartbeat(() => start);
    const text = renderWorkerMetrics(heartbeat, start + 120_000);
    expect(text).toContain('worker_last_tick_age_seconds 120');
  });

  it('формат Prometheus: у каждой метрики есть HELP и TYPE', () => {
    const heartbeat = createHeartbeat(() => 0);
    const text = renderWorkerMetrics(heartbeat, 0);
    const helps = (text.match(/^# HELP /gm) ?? []).length;
    const types = (text.match(/^# TYPE /gm) ?? []).length;
    expect(helps).toBe(types);
    expect(helps).toBeGreaterThanOrEqual(4);
  });
});

describe('простой — не зависание', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ночью, когда сообщений нет, воркер остаётся живым', () => {
    // Раньше отметка обновлялась ТОЛЬКО при обработке сообщения: пустая ночная очередь
    // выглядела как зависание, и docker перезапускал исправный воркер.
    let clock = 1_000_000;
    const heartbeat = createHeartbeat(() => clock);
    startIdleTicker(heartbeat, () => true, {
      intervalMs: 60_000,
      now: () => clock
    });

    for (let minute = 1; minute <= 10; minute += 1) {
      clock += 60_000;
      vi.advanceTimersByTime(60_000);
    }

    expect(isAlive(heartbeat, 300_000, clock)).toBe(true);
  });

  it('потеря связи с очередью видна: отметки перестают идти', () => {
    let clock = 1_000_000;
    let connected = true;
    const heartbeat = createHeartbeat(() => clock);
    startIdleTicker(heartbeat, () => connected, { intervalMs: 60_000, now: () => clock });

    connected = false;
    for (let minute = 1; minute <= 10; minute += 1) {
      clock += 60_000;
      vi.advanceTimersByTime(60_000);
    }

    expect(isAlive(heartbeat, 300_000, clock)).toBe(false);
  });
});
