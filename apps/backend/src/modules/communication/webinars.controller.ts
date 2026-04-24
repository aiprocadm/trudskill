import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';

import { WebinarsService } from './webinars.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('webinars')
@UseGuards(TenantGuard)
export class WebinarsController {
  constructor(@Inject(WebinarsService) private readonly service: WebinarsService) {}

  @Get()
  list(@CurrentContext() ctx: RequestContext, @Query() query: Record<string, string | undefined>) {
    return this.service.list(ctx.tenantId!, {
      page: Number(query.page ?? '1'),
      pageSize: Math.min(100, Math.max(1, Number(query.page_size ?? '20'))),
      status: query.status as any,
      sort: query.sort === 'updatedAt:asc' ? 'updatedAt:asc' : 'updatedAt:desc'
    });
  }

  @Post()
  create(@CurrentContext() ctx: RequestContext, @Body() body: any) {
    return this.service.create(ctx.tenantId!, ctx.userId!, body);
  }

  @Get(':id')
  details(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.get(ctx.tenantId!, id);
  }

  @Patch(':id')
  patch(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: any) {
    return this.service.patch(ctx.tenantId!, id, body);
  }

  @Get(':id/participants')
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
  addParticipant(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: any
  ) {
    return this.service.addParticipant(ctx.tenantId!, id, body);
  }
}
