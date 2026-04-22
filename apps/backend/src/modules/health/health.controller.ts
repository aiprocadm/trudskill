import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { RedisService } from '../../infrastructure/cache/redis.service.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(RabbitMqService) private readonly rabbit: RabbitMqService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(SecretsService) private readonly secrets: SecretsService
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'backend' };
  }

  @Get('startup')
  startup() {
    return { status: 'ok', started: true };
  }

  @Get('ready')
  async ready() {
    const [dbConnected, migrationState, redis, rabbitConnected, queue, storage, outbox] =
      await Promise.all([
        this.db.ping(),
        this.db.getMigrationReadiness(),
        this.redis.ping(),
        this.rabbit.ping(),
        this.db.getQueueReadiness({
          backlogThreshold: backendEnv.READINESS_QUEUE_BACKLOG_THRESHOLD,
          lagThresholdSeconds: backendEnv.READINESS_QUEUE_LAG_SECONDS_THRESHOLD
        }),
        this.storage.ping(),
        this.db.getOutboxReadiness(backendEnv.READINESS_OUTBOX_BACKLOG_THRESHOLD)
      ]);

    const checks = {
      database: {
        connected: dbConnected,
        migrations: migrationState
      },
      redis,
      queue: {
        connected: rabbitConnected && queue.connected,
        backlog: queue.backlog,
        lagSeconds: queue.lagSeconds,
        thresholds: {
          backlog: queue.backlogThreshold,
          lagSeconds: queue.lagThresholdSeconds
        },
        healthy: rabbitConnected && queue.healthy
      },
      storage,
      outbox: {
        backlog: outbox.backlog,
        threshold: outbox.backlogThreshold,
        healthy: outbox.healthy
      },
      secrets: this.secrets.getRotationPolicy()
    };

    if (
      !dbConnected ||
      !migrationState.healthy ||
      !rabbitConnected ||
      !queue.healthy ||
      !storage.healthy ||
      !outbox.healthy
    ) {
      throw new ServiceUnavailableException({
        code: 'readiness_failed',
        message: 'One or more readiness checks failed',
        checks
      });
    }

    if (!redis) {
      return { status: 'degraded', checks };
    }

    return {
      status: 'ok',
      checks
    };
  }
}
