import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';

import { IntegrationOrchestratorService } from './services/integration-orchestrator.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type {
  CreateCredentialDto,
  CreateExportTaskDto,
  CreateProviderDto,
  ListQueryDto,
  RotateSecretDto,
  UpdateCredentialDto,
  UpdateProviderDto
} from './dto/integrations.dto.js';
import type { RequestContext } from '../../common/context/request-context.js';

// SECURITY: these controllers were TenantGuard-only — any authenticated tenant user (including a
// low-privilege learner) could create/rotate credentials, kick off exports, read sync logs and
// mutate integration providers. Reads now require `integrations.read`, mutations `integrations.write`
// (seeded to admin roles in migration 0057), mirroring the documents/esign permission convention.

@Controller('integrations')
@UseGuards(TenantGuard, PermissionGuard)
export class IntegrationsController {
  constructor(
    @Inject(IntegrationOrchestratorService)
    private readonly orchestrator: IntegrationOrchestratorService
  ) {}

  @Get('providers')
  @RequirePermissions('integrations.read')
  listProviders(@Query() query: ListQueryDto) {
    return this.orchestrator.listProviders(query);
  }
  @Get('providers/:id')
  @RequirePermissions('integrations.read')
  getProvider(@Param('id') id: string) {
    return this.orchestrator.getProvider(id);
  }
  @Post('providers')
  @RequirePermissions('integrations.write')
  createProvider(@Body() body: CreateProviderDto) {
    return this.orchestrator.createProvider(body);
  }
  @Patch('providers/:id')
  @RequirePermissions('integrations.write')
  patchProvider(@Param('id') id: string, @Body() body: UpdateProviderDto) {
    return this.orchestrator.patchProvider(id, body);
  }
  @Post('providers/:id/activate')
  @RequirePermissions('integrations.write')
  activateProvider(@Param('id') id: string) {
    return this.orchestrator.patchProvider(id, { isActive: true });
  }
  @Post('providers/:id/deactivate')
  @RequirePermissions('integrations.write')
  deactivateProvider(@Param('id') id: string) {
    return this.orchestrator.patchProvider(id, { isActive: false });
  }

  @Get('credentials')
  @RequirePermissions('integrations.read')
  listCredentials(@CurrentContext() ctx: RequestContext, @Query() query: ListQueryDto) {
    return this.orchestrator.listCredentials(ctx.tenantId!, query);
  }
  @Get('credentials/:id')
  @RequirePermissions('integrations.read')
  getCredential(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.getCredential(ctx.tenantId!, id);
  }
  @Post('credentials')
  @RequirePermissions('integrations.write')
  createCredential(@CurrentContext() ctx: RequestContext, @Body() body: CreateCredentialDto) {
    return this.orchestrator.createCredential(ctx.tenantId!, body, ctx);
  }
  @Patch('credentials/:id')
  @RequirePermissions('integrations.write')
  patchCredential(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: UpdateCredentialDto
  ) {
    return this.orchestrator.patchCredential(ctx.tenantId!, id, body);
  }
  @Post('credentials/:id/rotate-secret')
  @RequirePermissions('integrations.write')
  rotateSecret(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: RotateSecretDto
  ) {
    return this.orchestrator.rotateSecret(ctx.tenantId!, id, body, ctx);
  }
  @Post('credentials/:id/activate')
  @RequirePermissions('integrations.write')
  activateCredential(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.setCredentialStatus(ctx.tenantId!, id, 'active');
  }
  @Post('credentials/:id/deactivate')
  @RequirePermissions('integrations.write')
  deactivateCredential(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.setCredentialStatus(ctx.tenantId!, id, 'inactive');
  }
  @Post('credentials/:id/test-connection')
  @RequirePermissions('integrations.write')
  testConnection(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.testConnection(ctx.tenantId!, id);
  }
  @Get('diagnostics')
  @RequirePermissions('integrations.read')
  diagnostics(@CurrentContext() ctx: RequestContext) {
    return { items: this.orchestrator.diagnostics(ctx.tenantId!) };
  }
}

@Controller('exports')
@UseGuards(TenantGuard, PermissionGuard)
export class ExportsController {
  constructor(
    @Inject(IntegrationOrchestratorService)
    private readonly orchestrator: IntegrationOrchestratorService
  ) {}

  @Get('tasks')
  @RequirePermissions('integrations.read')
  listTasks(@CurrentContext() ctx: RequestContext, @Query() query: ListQueryDto) {
    return this.orchestrator.listTasks(ctx.tenantId!, query);
  }
  @Get('tasks/:id')
  @RequirePermissions('integrations.read')
  getTask(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.getTask(ctx.tenantId!, id);
  }
  @Post('tasks')
  @RequirePermissions('integrations.write')
  createTask(
    @CurrentContext() ctx: RequestContext,
    @Body() body: CreateExportTaskDto,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    return this.orchestrator.createExportTask(ctx.tenantId!, ctx.userId!, body, idempotencyKey);
  }
  @Post('tasks/:id/retry')
  @RequirePermissions('integrations.write')
  retryTask(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.retryTask(ctx.tenantId!, id);
  }
  @Post('tasks/:id/cancel')
  @RequirePermissions('integrations.write')
  cancelTask(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.cancelTask(ctx.tenantId!, id);
  }
  @Get('tasks/:id/items')
  @RequirePermissions('integrations.read')
  getTaskItems(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.getTaskItems(ctx.tenantId!, id);
  }
  @Get('tasks/:id/result')
  @RequirePermissions('integrations.read')
  getTaskResult(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.getTask(ctx.tenantId!, id).resultFileId;
  }
  @Get('items/:id')
  @RequirePermissions('integrations.read')
  getItem(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.getItem(ctx.tenantId!, id);
  }
  @Get('dead-letters')
  @RequirePermissions('integrations.read')
  listDeadLetters(@CurrentContext() ctx: RequestContext) {
    return { items: this.orchestrator.listDeadLetters(ctx.tenantId!) };
  }
}

@Controller('sync-logs')
@UseGuards(TenantGuard, PermissionGuard)
export class SyncLogsController {
  constructor(
    @Inject(IntegrationOrchestratorService)
    private readonly orchestrator: IntegrationOrchestratorService
  ) {}
  @Get()
  @RequirePermissions('integrations.read')
  list(@CurrentContext() ctx: RequestContext, @Query() query: ListQueryDto) {
    return this.orchestrator.listSyncLogs(ctx.tenantId!, query);
  }
  @Get('by-entity')
  @RequirePermissions('integrations.read')
  byEntity(
    @CurrentContext() ctx: RequestContext,
    @Query('entity_type') entityType: string,
    @Query('entity_id') entityId: string
  ) {
    return this.orchestrator.byEntity(ctx.tenantId!, entityType, entityId);
  }
  @Get('by-provider')
  @RequirePermissions('integrations.read')
  byProvider(@CurrentContext() ctx: RequestContext, @Query('provider_code') providerCode: string) {
    return this.orchestrator.byProvider(ctx.tenantId!, providerCode);
  }
  @Get(':id')
  @RequirePermissions('integrations.read')
  get(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.orchestrator.getSyncLog(ctx.tenantId!, id);
  }
}
