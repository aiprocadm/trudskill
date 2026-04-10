import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { RedisService } from '../../infrastructure/cache/redis.service.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(RabbitMqService) private readonly rabbit: RabbitMqService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient
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
    const [db, redis, rabbitmq, storage] = await Promise.all([
      this.db.ping(),
      this.redis.ping(),
      this.rabbit.ping(),
      this.storage.ping()
    ]);

    if (!db) {
      throw new ServiceUnavailableException({
        code: 'db_unavailable',
        message: 'Database is unavailable',
        checks: { database: db, redis, rabbitmq, storage }
      });
    }

    return {
      status: redis && rabbitmq && storage.healthy ? 'ok' : 'degraded',
      checks: {
        database: db,
        redis,
        rabbitmq,
        storage
      }
    };
  }
}
