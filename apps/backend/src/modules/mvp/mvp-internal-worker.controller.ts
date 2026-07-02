import { randomUUID } from 'node:crypto';

import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

import { WorkerCallbackGuard } from './infrastructure/worker-callback.guard.js';
import { MvpEnrollmentService } from './mvp-enrollment.service.js';
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

/**
 * Внутренний вызов из apps/worker после сообщения RabbitMQ — не использовать из браузера.
 *
 * CRITICAL: this runs OUTSIDE an HTTP request, so MvpRequestPersistenceInterceptor never fires
 * (and could not anyway — it keys tenant off ctx/headers, not the body). A request-scoped
 * MvpService would therefore see an EMPTY MVP_STATE: every learner would fail `not_found`, the
 * callback would return an all-errors 200, the worker would ack, and the enrollment would be lost
 * forever. We route through MvpEnrollmentService (the singleton payment fulfillment also uses),
 * which hydrates tenant state from the snapshot and SAVES the mutation under the per-tenant lock.
 */
@Controller('internal/worker')
@UseGuards(WorkerCallbackGuard)
export class MvpInternalWorkerController {
  constructor(@Inject(MvpEnrollmentService) private readonly enrollment: MvpEnrollmentService) {}

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
    return this.enrollment.enrollIntoGroup(
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
