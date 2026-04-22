import { workerEnv } from './env.js';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /signature/i,
  /pii/i
];

const isSensitiveKey = (key: string) => SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactValue(entry)
      ])
    );
  }
  return value;
};

const log = (level: 'info' | 'error', message: string, context: Record<string, unknown>) => {
  process.stdout.write(
    `${JSON.stringify(
      redactValue({
        timestamp: new Date().toISOString(),
        level,
        service_name: 'worker',
        environment: workerEnv.NODE_ENV,
        version: workerEnv.RELEASE_VERSION,
        message,
        request_id: context.request_id ?? null,
        correlation_id: context.correlation_id ?? null,
        ...context
      })
    )}\n`
  );
};

log('info', 'worker_bootstrap_complete', {
  event_type: 'worker_startup',
  queue: workerEnv.DOCUMENT_GENERATION_QUEUE,
  worker_concurrency: workerEnv.WORKER_CONCURRENCY,
  rabbitmq_url: workerEnv.RABBITMQ_URL,
  redis_url: workerEnv.REDIS_URL
});
