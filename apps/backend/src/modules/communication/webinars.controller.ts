import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';

import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import {
  AddParticipantRequest,
  CreateWebinarRequest,
  ProviderSettingsRequest
} from './webinars.dto.js';
import { WebinarsService } from './webinars.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('webinars')
@UseGuards(TenantGuard)
export class WebinarsController {
  constructor(
    @Inject(WebinarsService) private readonly service: WebinarsService,
    @Inject(WebinarProviderSettingsService)
    private readonly settings: WebinarProviderSettingsService
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.read')
  list(@CurrentContext() ctx: RequestContext, @Query() query: Record<string, string | undefined>) {
    return this.service.list(ctx.tenantId!, {
      page: Number(query.page ?? '1'),
      pageSize: Math.min(100, Math.max(1, Number(query.page_size ?? '20'))),
      status: query.status as never,
      sort: query.sort === 'updatedAt:asc' ? 'updatedAt:asc' : 'updatedAt:desc'
    });
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.write')
  create(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateWebinarRequest, body);
    return this.service.create(ctx.tenantId!, ctx.userId!, dto);
  }

  // Learner self-view — MUST be declared before ':id' so it isn't captured as an id.
  @Get('mine')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.attend')
  mine(@CurrentContext() ctx: RequestContext) {
    return this.service.listMine(ctx.tenantId!, ctx.userId!);
  }

  @Get('provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.configure')
  getSettings(@CurrentContext() ctx: RequestContext) {
    return this.settings.get(ctx.tenantId!);
  }

  @Put('provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.configure')
  saveSettings(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(ProviderSettingsRequest, body);
    return this.settings.save(ctx.tenantId!, dto);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.read')
  details(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.get(ctx.tenantId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.write')
  patch(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: unknown) {
    const dto = assertValidDto(CreateWebinarRequest, body);
    return this.service.patch(ctx.tenantId!, id, dto);
  }

  @Get(':id/participants')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.read')
  participants(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.service.listParticipants(ctx.tenantId!, id, {
      page: Number(query.page ?? '1'),
      pageSize: Math.min(100, Math.max(1, Number(query.page_size ?? '20')))
    });
  }

  @Post(':id/participants')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.write')
  addParticipant(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const dto = assertValidDto(AddParticipantRequest, body);
    return this.service.addParticipant(ctx.tenantId!, id, {
      ...dto,
      attendanceStatus: 'invited'
    });
  }
}
