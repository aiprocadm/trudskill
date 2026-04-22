import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { BackfillService } from './backfill.service.js';

import type { BackfillDomain } from './backfill.types.js';

@Controller('migration/backfill')
export class BackfillController {
  constructor(private readonly backfill: BackfillService) {}

  @Post('runs')
  createRun(@Body() body: { domain: BackfillDomain; batchSize?: number }) {
    return this.backfill.createRun(body.domain, body.batchSize);
  }

  @Post('runs/:runId/process')
  processBatch(@Param('runId') runId: string) {
    return this.backfill.processNextBatch(runId);
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
