import { describe, expect, it } from 'vitest';
import { RedisService } from '../../infrastructure/cache/redis.service.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import { HealthController } from './health.controller.js';

describe('health controller', () => {
  it('reports ready status with dependency checks', async () => {
    const controller = new HealthController(
      new DatabaseService(),
      new RedisService(),
      new RabbitMqService(),
      new S3StorageClient()
    );

    const ready = await controller.ready();
    expect(ready.status).toBe('ok');
    expect(ready.checks.database).toBe(true);
  });
});
