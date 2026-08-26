import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CreateAndRunBackfillDto, CreateBackfillRunDto } from './backfill.request-dto.js';
import { BackfillService } from './backfill.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { WorkerCallbackGuard } from '../../mvp/infrastructure/worker-callback.guard.js';

// SECURITY: backfill operates ACROSS tenants (platform-level reconciliation), so TenantGuard —
// which derives a single tenant from the caller's JWT — does not fit. These ops-only routes are
// instead gated by a shared secret (`x-worker-callback-token`); when the secret is unset the
// guard fails closed (503), so the surface is never reachable unauthenticated. Previously the
// whole controller had NO guard at all → unauthenticated cross-tenant backfill + reports.
@UseGuards(WorkerCallbackGuard)
@Controller('migration/backfill')
export class BackfillController {
  constructor(@Inject(BackfillService) private readonly backfill: BackfillService) {}

  @Post('runs')
  createRun(@Body() raw: unknown) {
    /* Ревизия 2026-08-26: тело-литерал не проверялось (см. backfill.request-dto.ts). */
    const body = assertValidDto(CreateBackfillRunDto, raw);
    return this.backfill.createRun(body.domain, body.batchSize);
  }

  @Post('runs/start')
  createAndRun(@Body() raw: unknown) {
    const body = assertValidDto(CreateAndRunBackfillDto, raw);
    return this.backfill.createAndRun(body.domain, body.batchSize, body.maxBatches);
  }

  @Post('runs/:runId/process')
  processBatch(@Param('runId') runId: string) {
    return this.backfill.processNextBatch(runId);
  }

  @Post('runs/:runId/run')
  runUntilComplete(@Param('runId') runId: string, @Query('maxBatches') maxBatches?: string) {
    return this.backfill.runUntilComplete(runId, maxBatches ? Number(maxBatches) : undefined);
  }

  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.backfill.getRun(runId);
  }

  @Get('runs/:runId/items')
  getItems(@Param('runId') runId: string, @Query('limit') limit?: string) {
    return this.backfill.getItems(runId, limit ? Number(limit) : undefined);
  }

  @Get('reports/:runId')
  getReport(@Param('runId') runId: string) {
    return this.backfill.getReport(runId);
  }

  @Get('reports/:runId/export')
  async exportReport(@Param('runId') runId: string, @Query('format') format?: string) {
    const reportFormat = format === 'csv' ? 'csv' : 'json';
    const payload = await this.backfill.exportReport(runId, reportFormat);
    return {
      format: reportFormat,
      payload
    };
  }

  @Get('diagnostics')
  diagnostics(@Query('limit') limit?: string) {
    return this.backfill.listDiagnostics(limit ? Number(limit) : undefined);
  }
}
