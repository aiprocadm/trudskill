import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { PushSubscriptionService } from './push-subscription.service.js';
import { SubscribePushRequest, UnsubscribePushRequest } from './web-push.dto.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { backendEnv } from '../../../env.js';
import { MvpRequestPersistenceInterceptor } from '../../mvp/infrastructure/mvp-request-persistence.interceptor.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Phase 10 Track C — self-service web-push subscription endpoints. Like NotificationsController,
 * gated by TenantGuard ONLY (no @RequirePermissions): any authenticated tenant user manages
 * their OWN browser subscriptions, scoped by ctx.userId. The persistence interceptor loads/saves
 * the request's MVP-state (subscriptions live in `pushSubscriptions`).
 */
@Controller('web-push')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class WebPushController {
  constructor(@Inject(PushSubscriptionService) private readonly service: PushSubscriptionService) {}

  /** VAPID public key for the browser to subscribe; hides UI when push is disabled. */
  @Get('public-key')
  publicKey() {
    return {
      enabled: backendEnv.WEB_PUSH_ENABLED,
      publicKey: backendEnv.WEB_PUSH_ENABLED ? (backendEnv.VAPID_PUBLIC_KEY ?? null) : null
    };
  }

  @Get('subscriptions')
  listSubscriptions(@CurrentContext() ctx: RequestContext) {
    return this.service.listForUser(ctx.tenantId!, ctx.userId!);
  }

  @Post('subscribe')
  subscribe(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(SubscribePushRequest, body);
    return this.service.subscribe(ctx.tenantId!, ctx.userId!, dto, ctx);
  }

  @Delete('subscribe')
  unsubscribe(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(UnsubscribePushRequest, body);
    this.service.unsubscribe(ctx.tenantId!, ctx.userId!, dto.endpoint, ctx);
    return { ok: true };
  }
}
