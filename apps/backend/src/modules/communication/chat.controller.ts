import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';

import { ChatService } from './chat.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('chat/dialogs')
@UseGuards(TenantGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly service: ChatService) {}

  @Get()
  list(@CurrentContext() ctx: RequestContext) {
    return this.service.listDialogs(ctx.tenantId!, ctx.userId);
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
  messages(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.listMessages(ctx.tenantId!, id, ctx.userId);
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
