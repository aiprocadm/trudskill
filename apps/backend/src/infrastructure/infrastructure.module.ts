import { Module } from '@nestjs/common';
import { DatabaseService } from './database/database.service.js';
import { TenantScopedRepository } from './database/tenant-repository.js';
import { RabbitMqService } from './messaging/rabbitmq.service.js';
import { RedisService } from './cache/redis.service.js';
import { S3StorageClient } from './storage/s3-storage.client.js';

@Module({
  providers: [DatabaseService, RedisService, RabbitMqService, S3StorageClient, TenantScopedRepository],
  exports: [DatabaseService, RedisService, RabbitMqService, S3StorageClient, TenantScopedRepository]
})
export class InfrastructureModule {}
