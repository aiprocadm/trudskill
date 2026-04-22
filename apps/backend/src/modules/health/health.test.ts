import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../env.js', () => ({
  backendEnv: {
    READINESS_QUEUE_BACKLOG_THRESHOLD: 100,
    READINESS_QUEUE_LAG_SECONDS_THRESHOLD: 30,
    READINESS_OUTBOX_BACKLOG_THRESHOLD: 50
  }
}));

import { HealthController } from './health.controller.js';
import { RedisService } from '../../infrastructure/cache/redis.service.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

describe('health controller', () => {
  it('reports ready status with dependency checks', async () => {
    vi.spyOn(DatabaseService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(DatabaseService.prototype, 'getMigrationReadiness').mockResolvedValue({
      healthy: true,
      appliedCount: 3,
      pendingCount: 0,
      pending: []
    });
    vi.spyOn(DatabaseService.prototype, 'getQueueReadiness').mockResolvedValue({
      connected: true,
      backlog: 3,
      lagSeconds: 12,
      backlogThreshold: 100,
      lagThresholdSeconds: 30,
      healthy: true
    });
    vi.spyOn(DatabaseService.prototype, 'getOutboxReadiness').mockResolvedValue({
      backlog: 1,
      backlogThreshold: 50,
      healthy: true
    });
    vi.spyOn(RedisService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(RabbitMqService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(S3StorageClient.prototype, 'ping').mockResolvedValue({
      provider: 's3-compatible',
      healthy: true
    });
    vi.spyOn(SecretsService.prototype, 'getRotationPolicy').mockReturnValue({
      provider: 'env',
      maxAgeDays: 30,
      keyRefs: { authJwt: 'auth.jwt', session: 'session.cookie' }
    });

    const controller = new HealthController(
      new DatabaseService(),
      new RedisService(),
      new RabbitMqService(),
      new S3StorageClient(),
      new SecretsService()
    );

    const ready = await controller.ready();
    expect(ready.status).toBe('ok');
    expect(ready.checks.database.connected).toBe(true);
    expect(ready.checks.queue.healthy).toBe(true);
  });

  it('fails readiness when migrations are pending', async () => {
    vi.spyOn(DatabaseService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(DatabaseService.prototype, 'getMigrationReadiness').mockResolvedValue({
      healthy: false,
      appliedCount: 2,
      pendingCount: 1,
      pending: ['0018_migration_backfill_control.sql']
    });
    vi.spyOn(DatabaseService.prototype, 'getQueueReadiness').mockResolvedValue({
      connected: true,
      backlog: 0,
      lagSeconds: 0,
      backlogThreshold: 100,
      lagThresholdSeconds: 30,
      healthy: true
    });
    vi.spyOn(DatabaseService.prototype, 'getOutboxReadiness').mockResolvedValue({
      backlog: 0,
      backlogThreshold: 50,
      healthy: true
    });
    vi.spyOn(RedisService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(RabbitMqService.prototype, 'ping').mockResolvedValue(true);
    vi.spyOn(S3StorageClient.prototype, 'ping').mockResolvedValue({
      provider: 's3-compatible',
      healthy: true
    });
    vi.spyOn(SecretsService.prototype, 'getRotationPolicy').mockReturnValue({
      provider: 'env',
      maxAgeDays: 30,
      keyRefs: { authJwt: 'auth.jwt', session: 'session.cookie' }
    });

    const controller = new HealthController(
      new DatabaseService(),
      new RedisService(),
      new RabbitMqService(),
      new S3StorageClient(),
      new SecretsService()
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('exposes startup check', () => {
    const controller = new HealthController(
      new DatabaseService(),
      new RedisService(),
      new RabbitMqService(),
      new S3StorageClient(),
      new SecretsService()
    );

    expect(controller.startup()).toEqual({ status: 'ok', started: true });
  });
});
