import { beforeEach, describe, expect, it } from 'vitest';

import {
  getSchedulerRuns,
  isSchedulerOverdue,
  recordSchedulerRun,
  renderSchedulerMetrics,
  resetSchedulerRuns
} from './scheduler-heartbeat.js';

/**
 * Отметки планировщиков (ФТ-I2, Фаза 6 Task 6).
 *
 * Проверяем главное свойство: планировщик, который перестал запускаться, отличим от
 * планировщика, которому нечего делать. До этой правки оба выглядели одинаково — тихо.
 */
const DAY = 24 * 60 * 60 * 1000;

describe('отметки планировщиков', () => {
  beforeEach(() => {
    resetSchedulerRuns();
  });

  it('успешный прогон оставляет отметку времени', () => {
    const now = 1_700_000_000_000;
    recordSchedulerRun('reminders-daily-scan', 'ok', { expectedIntervalMs: DAY, now });

    const [run] = getSchedulerRuns();
    expect(run?.job).toBe('reminders-daily-scan');
    expect(run?.lastSuccessAt).toBe(now);
    expect(run?.runs).toBe(1);
    expect(run?.failures).toBe(0);
  });

  it('упавший прогон не стирает время последнего успеха', () => {
    const now = 1_700_000_000_000;
    recordSchedulerRun('rental-billing-overdue-sweep', 'ok', { expectedIntervalMs: DAY, now });
    recordSchedulerRun('rental-billing-overdue-sweep', 'error', {
      expectedIntervalMs: DAY,
      now: now + DAY
    });

    const [run] = getSchedulerRuns();
    expect(run?.lastSuccessAt).toBe(now);
    expect(run?.lastRunAt).toBe(now + DAY);
    expect(run?.failures).toBe(1);
  });

  it('молчание дольше двух интервалов — просрочка, короткий сдвиг — нет', () => {
    const now = 1_700_000_000_000;
    const run = recordSchedulerRun('identity-image-retention', 'ok', {
      expectedIntervalMs: DAY,
      now
    });

    // Ночной прогон может сдвинуться из-за перезапуска — это не авария.
    expect(isSchedulerOverdue(run, now + DAY + 60 * 60 * 1000)).toBe(false);
    // А вот двое суток тишины означают, что он не запускается вообще.
    expect(isSchedulerOverdue(run, now + 2 * DAY + 1000)).toBe(true);
  });

  it('падающий планировщик виден как просроченный, даже если «прогоны» идут', () => {
    const now = 1_700_000_000_000;
    recordSchedulerRun('expired-attempts-sweep', 'ok', { expectedIntervalMs: 5 * 60_000, now });
    for (let i = 1; i <= 10; i += 1) {
      recordSchedulerRun('expired-attempts-sweep', 'error', {
        expectedIntervalMs: 5 * 60_000,
        now: now + i * 5 * 60_000
      });
    }

    const [run] = getSchedulerRuns();
    expect(isSchedulerOverdue(run!, now + 50 * 60_000)).toBe(true);
  });

  it('метрики: возраст успеха, счётчики по исходам и признак просрочки', () => {
    const now = 1_700_000_000_000;
    recordSchedulerRun('proctoring-video-retention', 'ok', { expectedIntervalMs: DAY, now });

    const text = renderSchedulerMetrics(now + 3 * DAY);

    expect(text).toContain(
      'scheduler_last_success_age_seconds{job="proctoring-video-retention"} 259200'
    );
    expect(text).toContain('scheduler_runs_total{job="proctoring-video-retention",outcome="ok"} 1');
    expect(text).toContain(
      'scheduler_runs_total{job="proctoring-video-retention",outcome="error"} 0'
    );
    expect(text).toContain('scheduler_overdue{job="proctoring-video-retention"} 1');
  });

  it('пока ни один планировщик не отработал — метрик нет, а не нули', () => {
    // Пустая выдача честнее: «возраст 0» у не запускавшегося планировщика читался бы
    // как «только что отработал».
    expect(renderSchedulerMetrics(1_700_000_000_000)).toBe('');
  });

  it('формат Prometheus: HELP и TYPE у каждой метрики', () => {
    recordSchedulerRun('reminders-daily-scan', 'ok', { now: 1_700_000_000_000 });
    const text = renderSchedulerMetrics(1_700_000_000_000);
    expect((text.match(/^# HELP /gm) ?? []).length).toBe(3);
    expect((text.match(/^# TYPE /gm) ?? []).length).toBe(3);
  });
});
