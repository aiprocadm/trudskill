import { Controller, Get } from '@nestjs/common';
import { RedisService } from '../../infrastructure/cache/redis.service.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly rabbit: RabbitMqService,
    private readonly storage: S3StorageClient
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'backend' };
  }

  @Get('ready')
  async ready() {
    const [db, redis, rabbitmq, storage] = await Promise.all([
      this.db.ping(),
      this.redis.ping(),
      this.rabbit.ping(),
      this.storage.ping()
    ]);

    return {
      status: db && redis && rabbitmq && storage.healthy ? 'ok' : 'degraded',
      checks: {
        database: db,
        redis,
        rabbitmq,
        storage
      }
    };
  }
}
