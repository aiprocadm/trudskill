import { describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller.js';
import { RedisService } from '../../infrastructure/cache/redis.service.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

describe('health controller', () => {
  it('reports ready status with dependency checks', async () => {
    vi.spyOn(DatabaseService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(RedisService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(RabbitMqService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(S3StorageClient.prototype, 'ping').mockResolvedValue({
      provider: 's3-compatible',
      healthy: true
    });

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

  it('exposes startup check', () => {
    const controller = new HealthController(
      new DatabaseService(),
      new RedisService(),
      new RabbitMqService(),
      new S3StorageClient()
    );

    expect(controller.startup()).toEqual({ status: 'ok', started: true });
  });

  it('reports degraded when non-critical infra is unavailable', async () => {
    vi.spyOn(DatabaseService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(RedisService.prototype, 'ping').mockResolvedValue(false);
    vi.spyOn(RabbitMqService.prototype, 'ping').mockResolvedValue(false);
    vi.spyOn(S3StorageClient.prototype, 'ping').mockResolvedValue({
      provider: 's3-compatible',
      healthy: false
    });

    const controller = new HealthController(
      new DatabaseService(),
      new RedisService(),
      new RabbitMqService(),
      new S3StorageClient()
    );

    const ready = await controller.ready();
    expect(ready.status).toBe('degraded');
    expect(ready.checks.database).toBe(true);
    expect(ready.checks.rabbitmq).toBe(false);
    expect(ready.checks.storage.healthy).toBe(false);
  });

  it('fails readiness when database is unavailable', async () => {
    vi.spyOn(DatabaseService.prototype, 'ping').mockResolvedValue(false);
    vi.spyOn(RedisService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(RabbitMqService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(S3StorageClient.prototype, 'ping').mockResolvedValue({
      provider: 's3-compatible',
      healthy: true
    });

    const controller = new HealthController(
      new DatabaseService(),
      new RedisService(),
      new RabbitMqService(),
      new S3StorageClient()
    );

    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        code: 'db_unavailable'
      }
    });
  });
});
