import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';

import { ChatService } from './chat.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('chat/dialogs')
@UseGuards(TenantGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly service: ChatService) {}

  @Get()
  list(@CurrentContext() ctx: RequestContext, @Query() query: Record<string, string | undefined>) {
    return this.service.listDialogs(ctx.tenantId!, ctx.userId, {
      page: Number(query.page ?? '1'),
      pageSize: Math.min(100, Math.max(1, Number(query.page_size ?? '20'))),
      sort: query.sort === 'updatedAt:asc' ? 'updatedAt:asc' : 'updatedAt:desc'
    });
  }

  @Post()
  create(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      type: 'direct' | 'entity_linked' | 'support';
      participantUserIds: string[];
      relatedEntityType?: string;
      relatedEntityId?: string;
      assignedUserId?: string;
    }
  ) {
    return this.service.createDialog(ctx.tenantId!, ctx.userId!, body);
  }

  @Get(':id')
  details(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.getDialog(ctx.tenantId!, id, ctx.userId);
  }

  @Get(':id/messages')
  messages(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.service.listMessages(ctx.tenantId!, id, ctx.userId, {
      page: Number(query.page ?? '1'),
      pageSize: Math.min(100, Math.max(1, Number(query.page_size ?? '20'))),
      sort: query.sort === 'sentAt:asc' ? 'sentAt:asc' : 'sentAt:desc'
    });
  }

  @Post(':id/messages')
  postMessage(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: { textBody: string }
  ) {
    return this.service.postMessage(ctx.tenantId!, id, ctx.userId!, body.textBody);
  }

  @Post(':id/read')
  read(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.markRead(ctx.tenantId!, id, ctx.userId!);
  }
}
