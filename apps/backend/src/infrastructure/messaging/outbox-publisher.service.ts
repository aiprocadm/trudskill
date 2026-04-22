import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { RabbitMqService } from './rabbitmq.service.js';
import { backendEnv } from '../../env.js';
import { DatabaseService } from '../database/database.service.js';

type OutboxStatus = 'pending' | 'published' | 'failed';

interface ClaimedOutboxEvent {
  id: string;
  exchange: string;
  routingKey: string;
  payload: Record<string, unknown>;
  retryCount: number;
}

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private pollingHandle: NodeJS.Timeout | null = null;
  private isPolling = false;
  private readonly claimToken = `backend-${process.pid}`;

  constructor(
    private readonly db: DatabaseService,
    private readonly rabbitMq: RabbitMqService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!backendEnv.OUTBOX_PUBLISHER_ENABLED) {
      this.logger.log('Outbox publisher disabled by configuration');
      return;
    }

    this.pollingHandle = setInterval(() => {
      void this.pollOnce();
    }, backendEnv.OUTBOX_POLL_INTERVAL_MS);

    await this.pollOnce();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollingHandle) {
      clearInterval(this.pollingHandle);
      this.pollingHandle = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const batch = await this.claimBatch(backendEnv.OUTBOX_BATCH_SIZE);
      for (const event of batch) {
        await this.publishClaimedEvent(event);
      }
    } catch (error) {
      this.logger.error(
        'Outbox polling cycle failed',
        error instanceof Error ? error.stack : undefined
      );
    } finally {
      this.isPolling = false;
    }
  }

  private async claimBatch(limit: number): Promise<ClaimedOutboxEvent[]> {
    return this.db.withTransaction(async (client) => {
      const rows = await this.db.query<{
        id: string;
        exchange: string;
        routing_key: string;
        payload_json: Record<string, unknown>;
        retry_count: number;
      }>(
        `with locked as (
           select id
           from core.outbox_events
           where status = 'pending'
             and next_attempt_at <= now()
           order by next_attempt_at asc, created_at asc
           for update skip locked
           limit $1
         )
         update core.outbox_events e
         set locked_at = now(),
             claimed_by = $2,
             updated_at = now()
         from locked
         where e.id = locked.id
         returning e.id, e.exchange, e.routing_key, e.payload_json, e.retry_count`,
        [limit, this.claimToken],
        client
      );

      return rows.map((row) => ({
        id: row.id,
        exchange: row.exchange,
        routingKey: row.routing_key,
        payload: row.payload_json,
        retryCount: row.retry_count
      }));
    });
  }

  private async publishClaimedEvent(event: ClaimedOutboxEvent): Promise<void> {
    try {
      await this.rabbitMq.publish(event.exchange, event.routingKey, event.payload);
      await this.markStatus(event.id, 'published', null, event.retryCount);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown publish error';
      await this.markPublishFailure(event.id, event.retryCount, errorMessage);
      this.logger.warn(`Failed to publish outbox event ${event.id}: ${errorMessage}`);
    }
  }

  private async markStatus(
    id: string,
    status: OutboxStatus,
    lastError: string | null,
    retryCount: number
  ): Promise<void> {
    await this.db.query(
      `update core.outbox_events
       set status = $2,
           last_error = $3,
           published_at = case when $2 = 'published' then now() else published_at end,
           retry_count = $4,
           locked_at = null,
           claimed_by = null,
           updated_at = now()
       where id = $1`,
      [id, status, lastError, retryCount]
    );
  }

  private async markPublishFailure(
    id: string,
    retryCount: number,
    lastError: string
  ): Promise<void> {
    const nextRetryCount = retryCount + 1;
    const shouldFail = nextRetryCount >= backendEnv.OUTBOX_MAX_RETRIES;
    const status: OutboxStatus = shouldFail ? 'failed' : 'pending';
    await this.db.query(
      `update core.outbox_events
       set status = $2,
           retry_count = $3,
           last_error = $4,
           next_attempt_at = case
             when $2 = 'failed' then now()
             else now() + make_interval(secs => least(3600, power(2, least($3, 12))::int))
           end,
           locked_at = null,
           claimed_by = null,
           updated_at = now()
       where id = $1`,
      [id, status, nextRetryCount, lastError]
    );
  }
}
