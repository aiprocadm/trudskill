'use client';

type MetricName =
  | 'time_to_start_learning'
  | 'time_to_submit_assignment'
  | 'assignment_submit_dropoff'
  | 'form_error_rate'
  | 'csat_after_submission'
  | 'csat_after_grade_view';

type MetricEvent = {
  name: MetricName;
  value?: number;
  meta?: Record<string, string | number | boolean | null | undefined>;
  at: string;
};

const STORAGE_KEY = 'lms_ux_metrics_events_v1';
const SESSION_KEY = 'lms_ux_metrics_timers_v1';

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage failures */
  }
};

export const startMetricTimer = (name: MetricName) => {
  const timers = readJson<Record<string, number>>(SESSION_KEY, {});
  timers[name] = Date.now();
  writeJson(SESSION_KEY, timers);
};

export const completeMetricTimer = (
  name: MetricName,
  meta?: Record<string, string | number | boolean | null | undefined>
) => {
  const timers = readJson<Record<string, number>>(SESSION_KEY, {});
  const startedAt = timers[name];
  if (!startedAt) return;
  const durationMs = Date.now() - startedAt;
  delete timers[name];
  writeJson(SESSION_KEY, timers);
  recordMetric(name, durationMs, meta);
};

export const recordMetric = (
  name: MetricName,
  value?: number,
  meta?: Record<string, string | number | boolean | null | undefined>
) => {
  const events = readJson<MetricEvent[]>(STORAGE_KEY, []);
  const next: MetricEvent = {
    name,
    ...(value !== undefined ? { value } : {}),
    ...(meta !== undefined ? { meta } : {}),
    at: new Date().toISOString()
  };
  events.push(next);
  writeJson(STORAGE_KEY, events.slice(-500));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lms:metric', { detail: next }));
  }
};

export const getMetricBaseline = () => readJson<MetricEvent[]>(STORAGE_KEY, []);
