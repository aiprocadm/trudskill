import { beforeEach, describe, expect, it } from 'vitest';

import {
  completeMetricTimer,
  getMetricBaseline,
  recordJourneyStep,
  recordMetric,
  startMetricTimer
} from './ux-metrics';

const createStorageMock = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    }
  } as Storage;
};

describe('ux metrics', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageMock(),
      configurable: true
    });
    globalThis.localStorage.clear();
  });

  it('records metric events and keeps baseline', () => {
    recordMetric('form_error_rate', 1, { screen: 'login' });
    const baseline = getMetricBaseline();
    expect(baseline).toHaveLength(1);
    expect(baseline[0]?.name).toBe('form_error_rate');
  });

  it('records duration for timers', () => {
    startMetricTimer('time_to_start_learning');
    completeMetricTimer('time_to_start_learning', { role: 'learner' });
    const baseline = getMetricBaseline();
    expect(baseline.some((item) => item.name === 'time_to_start_learning')).toBe(true);
  });

  it('records role journey step status', () => {
    recordJourneyStep('teacher', 'primary_flow', 'review_work', 'success');
    recordJourneyStep('teacher', 'primary_flow', 'send_feedback', 'dropoff');
    const baseline = getMetricBaseline();
    expect(baseline.some((item) => item.name === 'journey_step_success')).toBe(true);
    expect(baseline.some((item) => item.name === 'journey_step_dropoff')).toBe(true);
  });
});
