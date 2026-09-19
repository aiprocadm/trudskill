import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { BackgroundTasksService } from '../background-tasks/background-tasks.service.js';

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
  constructor(
    @Inject(RabbitMqService) private readonly rabbitMq: RabbitMqService,
    /*
     * ТЗ 12.2: задача, о судьбе которой человек не может узнать, — это не «фоновая работа»,
     * а пропажа. Реестр необязателен как зависимость: без него постановка в очередь всё равно
     * состоится, но человек её не увидит, поэтому в сборке он есть всегда.
     */
    @Optional()
    @Inject(BackgroundTasksService)
    private readonly tasks?: BackgroundTasksService
  ) {}

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
    /*
     * Запись в реестре заводится ПОСЛЕ успешной публикации: иначе человек увидел бы задачу,
     * которой в очереди нет, и ждал бы её вечно.
     */
    await this.tasks?.start({
      tenantId,
      kind: 'bulk_enrollment',
      title: `Массовое зачисление: ${body.learnerIds?.length ?? 0} чел.`,
      messageId,
      ...(actorId ? { createdBy: actorId } : {}),
      ...(body.learnerIds ? { totalCount: body.learnerIds.length } : {})
    });

    return {
      status: 'queued',
      messageId,
      idempotencyKey: body.idempotencyKey
    };
  }
}
