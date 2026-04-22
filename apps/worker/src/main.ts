import { createRequire } from 'node:module';

import { workerEnv } from './env.js';

const require = createRequire(import.meta.url);
const amqp = require('amqplib') as any;
const { Pool } = require('pg') as any;

type WorkerJobType = 'document' | 'integration' | 'notification';

type RetryDecision = 'retry' | 'dead-letter';

interface WorkerEnvelope {
  messageId: string;
  tenantId: string;
  jobType: WorkerJobType;
  payload: Record<string, unknown>;
}

const log = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context: Record<string, unknown>
) => {
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

const db = new Pool({ connectionString: workerEnv.DATABASE_URL, max: 10 });

function computeBackoffMs(retryCount: number): number {
  const exponential = workerEnv.WORKER_BACKOFF_BASE_MS * 2 ** Math.max(0, retryCount - 1);
  return Math.min(workerEnv.WORKER_BACKOFF_MAX_MS, exponential);
}

function extractRetryCount(message: any): number {
  const current = message.properties.headers['x-retry-count'];
  if (typeof current === 'number' && Number.isFinite(current)) {
    return current;
  }

  return 0;
}

function decideRetry(retryCount: number, error: unknown): RetryDecision {
  if (retryCount >= workerEnv.WORKER_MAX_RETRIES) {
    return 'dead-letter';
  }

  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const nonRetryable = new Set(['ValidationError', 'NonRetryableJobError']);
  if (nonRetryable.has(errorName)) {
    return 'dead-letter';
  }

  return 'retry';
}

async function markProcessed(messageId: string, queueName: string): Promise<boolean> {
  const result = await db.query(
    `insert into core.processed_message_ids (consumer_name, message_id, queue_name)
     values ($1, $2, $3)
     on conflict (consumer_name, message_id) do nothing`,
    [workerEnv.WORKER_CONSUMER_NAME, messageId, queueName]
  );

  return result.rowCount > 0;
}

async function processJob(envelope: WorkerEnvelope): Promise<void> {
  switch (envelope.jobType) {
    case 'document':
      return;
    case 'integration':
      return;
    case 'notification':
      return;
    default:
      throw new Error(`Unknown job type: ${String((envelope as { jobType?: unknown }).jobType)}`);
  }
}

async function bootstrap(): Promise<void> {
  const connection = await amqp.connect(workerEnv.RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(workerEnv.WORKER_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(workerEnv.WORKER_RETRY_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(workerEnv.WORKER_DLX_EXCHANGE, 'topic', { durable: true });

  const retryQueue = `${workerEnv.DOCUMENT_GENERATION_QUEUE}.retry`;

  await channel.assertQueue(workerEnv.DOCUMENT_GENERATION_QUEUE, {
    durable: true,
    deadLetterExchange: workerEnv.WORKER_DLX_EXCHANGE
  });
  await channel.bindQueue(workerEnv.DOCUMENT_GENERATION_QUEUE, workerEnv.WORKER_EXCHANGE, '#');

  await channel.assertQueue(retryQueue, {
    durable: true,
    deadLetterExchange: workerEnv.WORKER_EXCHANGE
  });
  await channel.bindQueue(retryQueue, workerEnv.WORKER_RETRY_EXCHANGE, '#');

  await channel.assertQueue(workerEnv.WORKER_DLQ_QUEUE, { durable: true });
  await channel.bindQueue(workerEnv.WORKER_DLQ_QUEUE, workerEnv.WORKER_DLX_EXCHANGE, '#');

  await channel.prefetch(workerEnv.WORKER_PREFETCH);

  await channel.consume(
    workerEnv.DOCUMENT_GENERATION_QUEUE,
    async (msg: any) => {
      if (!msg) {
        return;
      }

      const retryCount = extractRetryCount(msg);
      const body = msg.content.toString('utf8');

      try {
        const parsed = JSON.parse(body) as WorkerEnvelope;
        if (!parsed.messageId || !parsed.jobType) {
          throw new Error('Invalid envelope: messageId/jobType are required');
        }

        const inserted = await markProcessed(parsed.messageId, workerEnv.DOCUMENT_GENERATION_QUEUE);
        if (!inserted) {
          channel.ack(msg);
          log('info', 'worker_duplicate_message_skipped', {
            messageId: parsed.messageId,
            queue: workerEnv.DOCUMENT_GENERATION_QUEUE
          });
          return;
        }

        await processJob(parsed);
        channel.ack(msg);
        log('info', 'worker_message_processed', {
          messageId: parsed.messageId,
          jobType: parsed.jobType,
          queue: workerEnv.DOCUMENT_GENERATION_QUEUE,
          retryCount
        });
      } catch (error) {
        const decision = decideRetry(retryCount, error);
        const errorMessage = error instanceof Error ? error.message : 'unknown worker error';

        if (decision === 'retry') {
          const nextRetryCount = retryCount + 1;
          const delayMs = computeBackoffMs(nextRetryCount);
          const headers = {
            ...msg.properties.headers,
            'x-retry-count': nextRetryCount,
            'x-next-attempt-at': new Date(Date.now() + delayMs).toISOString(),
            'x-last-error': errorMessage
          };

          const published = channel.publish(
            workerEnv.WORKER_RETRY_EXCHANGE,
            msg.fields.routingKey || 'documents.retry',
            msg.content,
            {
              persistent: true,
              contentType: msg.properties.contentType,
              correlationId: msg.properties.correlationId,
              messageId: msg.properties.messageId,
              headers,
              expiration: String(delayMs)
            }
          );

          if (!published) {
            channel.nack(msg, false, true);
            return;
          }

          channel.ack(msg);
          log('warn', 'worker_message_requeued_with_backoff', {
            queue: workerEnv.DOCUMENT_GENERATION_QUEUE,
            retryCount: nextRetryCount,
            delayMs,
            error: errorMessage
          });
          return;
        }

        channel.nack(msg, false, false);
        log('error', 'worker_message_dead_lettered', {
          queue: workerEnv.DOCUMENT_GENERATION_QUEUE,
          retryCount,
          error: errorMessage
        });
      }
    },
    { noAck: false }
  );

  log('info', 'worker_bootstrap_complete', {
    event_type: 'worker_startup',
    queue: workerEnv.DOCUMENT_GENERATION_QUEUE,
    worker_concurrency: workerEnv.WORKER_CONCURRENCY,
    worker_prefetch: workerEnv.WORKER_PREFETCH,
    rabbitmq_url: workerEnv.RABBITMQ_URL,
    redis_url: workerEnv.REDIS_URL
  });

  const shutdown = async (signal: string) => {
    log('info', 'worker_shutdown_started', { signal });
    await channel.close();
    await connection.close();
    await db.end();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap().catch((error: unknown) => {
  log('error', 'worker_bootstrap_failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
