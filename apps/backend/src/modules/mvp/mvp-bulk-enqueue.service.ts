import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';

import type { CreateBulkEnrollmentsRequest } from './mvp.dto.js';

export interface BulkEnqueueMessagePayload {
  actorId?: string;
  idempotencyKey: string;
  groupId: string;
  learnerIds?: string[];
  organizationUnitId?: string;
}

@Injectable()
export class MvpBulkEnqueueService {
  constructor(@Inject(RabbitMqService) private readonly rabbitMq: RabbitMqService) {}

  async publishBulkJob(
    tenantId: string,
    actorId: string | undefined,
    body: CreateBulkEnrollmentsRequest,
    requestId?: string,
    correlationId?: string
  ): Promise<{ status: 'queued'; messageId: string; idempotencyKey: string }> {
    const messageId = randomUUID();
    const payload: BulkEnqueueMessagePayload = {
      actorId,
      idempotencyKey: body.idempotencyKey,
      groupId: body.groupId,
      learnerIds: body.learnerIds,
      organizationUnitId: body.organizationUnitId
    };
    const envelope = {
      messageId,
      tenantId,
      jobType: 'bulk_enrollment' as const,
      payload
    };
    await this.rabbitMq.publish(
      backendEnv.JOB_EXCHANGE,
      backendEnv.JOB_ROUTING_BULK_ENROLLMENT,
      envelope,
      {
        requestId,
        correlationId
      }
    );
    return {
      status: 'queued',
      messageId,
      idempotencyKey: body.idempotencyKey
    };
  }
}
