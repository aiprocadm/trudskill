import { randomUUID } from 'node:crypto';

import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

import { WorkerCallbackGuard } from './infrastructure/worker-callback.guard.js';
import { MvpService } from './mvp.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';

import type { RequestContext } from '../../common/context/request-context.js';

class WorkerBulkPayloadDto {
  @IsOptional()
  @IsString()
  actorId?: string;

  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  groupId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learnerIds?: string[];

  @IsOptional()
  @IsString()
  organizationUnitId?: string;
}

class WorkerBulkEnrollmentBodyDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
  correlationId?: string;

  @ValidateNested()
  @Type(() => WorkerBulkPayloadDto)
  payload!: WorkerBulkPayloadDto;
}

/** Внутренний вызов из apps/worker после сообщения RabbitMQ — не использовать из браузера. */
@Controller('internal/worker')
@UseGuards(WorkerCallbackGuard)
export class MvpInternalWorkerController {
  constructor(@Inject(MvpService) private readonly mvpService: MvpService) {}

  @Post('mvp/bulk-enrollments')
  processBulkEnrollment(@Body() raw: unknown) {
    const body = assertValidDto(WorkerBulkEnrollmentBodyDto, raw);
    const p = body.payload;
    const ctx: RequestContext = {
      requestId: body.requestId ?? randomUUID(),
      correlationId: body.correlationId ?? randomUUID(),
      tenantId: body.tenantId,
      userId: p.actorId
    };
    return this.mvpService.createBulkEnrollments(
      body.tenantId,
      p.actorId,
      {
        idempotencyKey: p.idempotencyKey,
        groupId: p.groupId,
        learnerIds: p.learnerIds ?? [],
        organizationUnitId: p.organizationUnitId,
        deliveryMode: 'immediate'
      },
      ctx
    );
  }
}
