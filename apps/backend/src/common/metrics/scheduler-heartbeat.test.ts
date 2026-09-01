import { beforeEach, describe, expect, it } from 'vitest';

import {
  declareScheduler,
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
    // Инвариант здесь — «у КАЖДОЙ метрики есть и HELP, и TYPE», а не их число: жёсткая
    // тройка ломалась от любой новой метрики и заставляла править тест вместо проверки
    // сути (четвёртой стала `scheduler_enabled`, журнал 327).
    const help = text.match(/^# HELP (\w+)/gm) ?? [];
    const type = text.match(/^# TYPE (\w+)/gm) ?? [];
    expect(help.length).toBe(type.length);
    expect(help.length).toBeGreaterThanOrEqual(4);
    expect(help.map((l) => l.replace('# HELP ', ''))).toEqual(
      type.map((l) => l.replace('# TYPE ', ''))
    );
  });
});

describe('планировщик виден с самого запуска, а не с первого прогона (журнал 327)', () => {
  beforeEach(() => resetSchedulerRuns());

  it('объявленный, но ни разу не отработавший планировщик ВИДЕН в метриках', () => {
    // Ровно та беда, ради которой механизм и заводился: «не тот cron, упавшая блокировка,
    // отключён». Пока отметка появлялась только после первого прогона, все три случая
    // выглядели как ОТСУТСТВИЕ метрики — тревогу на это не напишешь.
    declareScheduler('reminders-daily-scan', {
      expectedIntervalMs: DAY,
      enabled: true,
      now: 1_700_000_000_000
    });

    const text = renderSchedulerMetrics(1_700_000_000_000);

    expect(text).toContain('scheduler_enabled{job="reminders-daily-scan"} 1');
    expect(text).toContain('scheduler_runs_total{job="reminders-daily-scan",outcome="ok"} 0');
  });

  it('объявленный и не отработавший дольше двух интервалов — просрочен', () => {
    const start = 1_700_000_000_000;
    declareScheduler('reminders-daily-scan', {
      expectedIntervalMs: DAY,
      enabled: true,
      now: start
    });

    expect(renderSchedulerMetrics(start + 3 * DAY)).toContain(
      'scheduler_overdue{job="reminders-daily-scan"} 1'
    );
  });

  it('намеренно выключенный НЕ считается просроченным, но виден отдельным признаком', () => {
    // Выключенный намеренно и сломанный обязаны различаться: иначе тревога либо врёт,
    // либо её отключают.
    const start = 1_700_000_000_000;
    declareScheduler('proctoring-retention-sweep', {
      expectedIntervalMs: DAY,
      enabled: false,
      now: start
    });

    const text = renderSchedulerMetrics(start + 30 * DAY);

    expect(text).toContain('scheduler_enabled{job="proctoring-retention-sweep"} 0');
    expect(text).toContain('scheduler_overdue{job="proctoring-retention-sweep"} 0');
  });

  it('объявление не затирает уже накопленные прогоны', () => {
    const start = 1_700_000_000_000;
    recordSchedulerRun('reminders-daily-scan', 'ok', { expectedIntervalMs: DAY, now: start });
    declareScheduler('reminders-daily-scan', {
      expectedIntervalMs: DAY,
      enabled: true,
      now: start + DAY
    });

    const text = renderSchedulerMetrics(start + DAY);

    expect(text).toContain('scheduler_runs_total{job="reminders-daily-scan",outcome="ok"} 1');
    expect(text).toContain('scheduler_last_success_age_seconds{job="reminders-daily-scan"} 86400');
  });
});
