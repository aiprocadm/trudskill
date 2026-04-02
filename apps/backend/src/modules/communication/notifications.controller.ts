import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import type { RequestContext } from '../../common/context/request-context.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(TenantGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentContext() ctx: RequestContext, @Query() query: Record<string, string | undefined>) {
    return this.service.list(ctx.tenantId!, ctx.userId, query);
  }

  @Get('unread-counter')
  async unread(@CurrentContext() ctx: RequestContext) {
    return { count: await this.service.unreadCounter(ctx.tenantId!, ctx.userId) };
  }

  @Get(':id')
  details(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.get(ctx.tenantId!, id, ctx.userId);
  }

  @Post(':id/read')
  markRead(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.read(ctx.tenantId!, id, ctx.userId);
  }

  @Post('read-all')
  markAll(@CurrentContext() ctx: RequestContext) {
    return this.service.readAll(ctx.tenantId!, ctx.userId);
  }
}
