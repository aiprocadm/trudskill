import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';
import {
  CreateOrderRequest,
  CreateSelfOrderRequest,
  MarkPaidRequest,
  OrdersFilter,
  ProviderSettingsRequest
} from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller()
@UseGuards(TenantGuard)
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(PaymentProviderSettingsService)
    private readonly settings: PaymentProviderSettingsService
  ) {}

  @Post('orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.write')
  createOrder(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateOrderRequest, raw);
    return this.payments.createOrder(c.tenantId!, c.userId, b, c);
  }

  @Post('me/orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.self_purchase')
  createSelfOrder(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateSelfOrderRequest, raw);
    return this.payments.createOrder(
      c.tenantId!,
      c.userId,
      {
        buyerType: 'learner',
        buyerId: c.userId!,
        ...(b.description ? { description: b.description } : {}),
        items: b.items
      },
      c
    );
  }

  @Get('orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.read')
  listOrders(@CurrentContext() c: RequestContext, @Query() q: OrdersFilter) {
    return this.payments.listOrders(c.tenantId!, { ...(q.status ? { status: q.status } : {}) });
  }

  @Get('me/orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.self_purchase')
  listSelfOrders(@CurrentContext() c: RequestContext) {
    return this.payments.listOrders(c.tenantId!, { buyerId: c.userId });
  }

  @Get('orders/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.read')
  getOrder(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.payments.getOrder(c.tenantId!, id);
  }

  @Post('orders/:id/pay')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.self_purchase')
  pay(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.payments.pay(c.tenantId!, id, c);
  }

  @Post('orders/:id/mark-paid')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.write')
  markPaid(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(MarkPaidRequest, raw);
    return this.payments.markPaid(c.tenantId!, c.userId, id, b, c);
  }

  @Post('orders/:id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.write')
  cancelOrder(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.payments.cancelOrder(c.tenantId!, c.userId, id, c);
  }

  // Self-prefixed under /payments (controller base is root) — namespaces settings beside the webhook.
  @Get('payments/provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.configure')
  getProviderSettings(@CurrentContext() c: RequestContext) {
    return this.settings.get(c.tenantId!);
  }

  @Put('payments/provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('payments.configure')
  saveProviderSettings(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const dto = assertValidDto(ProviderSettingsRequest, raw);
    return this.settings.save(c.tenantId!, dto);
  }
}
