import { Module } from '@nestjs/common';

import { RedisService } from './cache/redis.service.js';
import { DatabaseService } from './database/database.service.js';
import { TenantScopedRepository } from './database/tenant-repository.js';
import { OutboxPublisherService } from './messaging/outbox-publisher.service.js';
import { RabbitMqService } from './messaging/rabbitmq.service.js';
import { TenantSerialGateway } from './request/tenant-serial.gateway.js';
import { SecretsService } from './secrets/secrets.service.js';
import { S3StorageClient } from './storage/s3-storage.client.js';

@Module({
  providers: [
    DatabaseService,
    RedisService,
    RabbitMqService,
    OutboxPublisherService,
    S3StorageClient,
    TenantScopedRepository,
    TenantSerialGateway,
    SecretsService
  ],
  exports: [
    DatabaseService,
    RedisService,
    RabbitMqService,
    OutboxPublisherService,
    S3StorageClient,
    TenantScopedRepository,
    TenantSerialGateway,
    SecretsService
  ]
})
export class InfrastructureModule {}
