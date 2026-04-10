import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { type WebinarsService } from './webinars.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('webinars')
@UseGuards(TenantGuard)
export class WebinarsController {
  constructor(private readonly service: WebinarsService) {}

  @Get() list(@CurrentContext() ctx: RequestContext) { return this.service.list(ctx.tenantId!); }
  @Post() create(@CurrentContext() ctx: RequestContext, @Body() body: any) { return this.service.create(ctx.tenantId!, ctx.userId!, body); }
  @Get(':id') details(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.service.get(ctx.tenantId!, id); }
  @Patch(':id') patch(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: any) { return this.service.patch(ctx.tenantId!, id, body); }
  @Get(':id/participants') participants(@CurrentContext() ctx: RequestContext, @Param('id') id: string) { return this.service.listParticipants(ctx.tenantId!, id); }
  @Post(':id/participants') addParticipant(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: any) { return this.service.addParticipant(ctx.tenantId!, id, body); }
}
