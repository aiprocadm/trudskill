import { workerEnv } from './env.js';

const log = (level: 'info' | 'error', message: string, context: Record<string, unknown>) => {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service_name: 'worker',
      environment: workerEnv.NODE_ENV,
      version: workerEnv.RELEASE_VERSION,
      message,
      ...context
    })}\n`
  );
};

log('info', 'worker_bootstrap_complete', {
  event_type: 'worker_startup',
  queue: workerEnv.DOCUMENT_GENERATION_QUEUE,
  worker_concurrency: workerEnv.WORKER_CONCURRENCY,
  rabbitmq_url: workerEnv.RABBITMQ_URL,
  redis_url: workerEnv.REDIS_URL
});
