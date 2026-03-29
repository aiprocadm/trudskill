import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import type { RequestContext } from '../../common/context/request-context.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { CreateCredentialDto, CreateExportTaskDto, CreateProviderDto, ListQueryDto, RotateSecretDto, UpdateCredentialDto, UpdateProviderDto } from './dto/integrations.dto.js';
import { IntegrationOrchestratorService } from './services/integration-orchestrator.service.js';

@Controller('integrations')
@UseGuards(TenantGuard)
export class IntegrationsController {
  constructor(private readonly orchestrator: IntegrationOrchestratorService) {}

  @Get('providers') listProviders() { return this.orchestrator.listProviders(); }
  @Get('providers/:id') getProvider(@Param('id') id: string) { return this.orchestrator.getProvider(id); }
  @Post('providers') createProvider(@Body() body: CreateProviderDto) { return this.orchestrator.createProvider(body); }
  @Patch('providers/:id') patchProvider(@Param('id') id: string, @Body() body: UpdateProviderDto) { return this.orchestrator.patchProvider(id, body); }
  @Post('providers/:id/activate') activateProvider(@Param('id') id: string) { return this.orchestrator.patchProvider(id, { isActive: true }); }
  @Post('providers/:id/deactivate') deactivateProvider(@Param('id') id: string) { return this.orchestrator.patchProvider(id, { isActive: false }); }

  @Get('credentials') listCredentials(@CurrentContext() ctx: RequestContext, @Query() _query: ListQueryDto) { return this.orchestrator.listCredentials(ctx.tenantId!); }
  @Get('credentials/:id') getCredential(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.getCredential(ctx.tenantId!, id); }
  @Post('credentials') createCredential(@CurrentContext() ctx: RequestContext, @Body() body: CreateCredentialDto) { return this.orchestrator.createCredential(ctx.tenantId!, body, ctx); }
  @Patch('credentials/:id') patchCredential(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: UpdateCredentialDto) { return this.orchestrator.patchCredential(ctx.tenantId!, id, body); }
  @Post('credentials/:id/rotate-secret') rotateSecret(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: RotateSecretDto) { return this.orchestrator.rotateSecret(ctx.tenantId!, id, body, ctx); }
  @Post('credentials/:id/activate') activateCredential(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.setCredentialStatus(ctx.tenantId!, id, 'active'); }
  @Post('credentials/:id/deactivate') deactivateCredential(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.setCredentialStatus(ctx.tenantId!, id, 'inactive'); }
  @Post('credentials/:id/test-connection') testConnection(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.testConnection(ctx.tenantId!, id); }
}

@Controller('exports')
@UseGuards(TenantGuard)
export class ExportsController {
  constructor(private readonly orchestrator: IntegrationOrchestratorService) {}

  @Get('tasks') listTasks(@CurrentContext() ctx: RequestContext, @Query() _query: ListQueryDto) { return this.orchestrator.listTasks(ctx.tenantId!); }
  @Get('tasks/:id') getTask(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.getTask(ctx.tenantId!, id); }
  @Post('tasks') createTask(@CurrentContext() ctx: RequestContext, @Body() body: CreateExportTaskDto, @Headers('idempotency-key') idempotencyKey?: string) { return this.orchestrator.createExportTask(ctx.tenantId!, ctx.userId!, body, idempotencyKey); }
  @Post('tasks/:id/retry') retryTask(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.retryTask(ctx.tenantId!, id); }
  @Post('tasks/:id/cancel') cancelTask(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.cancelTask(ctx.tenantId!, id); }
  @Get('tasks/:id/items') getTaskItems(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.getTaskItems(ctx.tenantId!, id); }
  @Get('tasks/:id/result') getTaskResult(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.getTask(ctx.tenantId!, id).resultFileId; }
  @Get('items/:id') getItem(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.getItem(ctx.tenantId!, id); }
}

@Controller('sync-logs')
@UseGuards(TenantGuard)
export class SyncLogsController {
  constructor(private readonly orchestrator: IntegrationOrchestratorService) {}
  @Get() list(@CurrentContext() ctx: RequestContext, @Query() _query: ListQueryDto) { return this.orchestrator.listSyncLogs(ctx.tenantId!); }
  @Get(':id') get(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.orchestrator.getSyncLog(ctx.tenantId!, id); }
  @Get('by-entity/search') byEntity(@CurrentContext() ctx: RequestContext, @Query('entity_type') entityType: string, @Query('entity_id') entityId: string) { return this.orchestrator.byEntity(ctx.tenantId!, entityType, entityId); }
  @Get('by-provider/search') byProvider(@CurrentContext() ctx: RequestContext, @Query('provider_code') providerCode: string) { return this.orchestrator.byProvider(ctx.tenantId!, providerCode); }
}
