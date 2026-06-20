import { Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider
} from '../../infrastructure/payments/payment.provider.js';

import type { Request } from 'express';

/**
 * Unguarded payment webhook (mirrors PublicVerifyController). The provider does NOT carry our
 * JWT / x-tenant-id — it POSTs to a public URL. Tenant is resolved from the stored payment row
 * (provider_payment_id → tenant_id); authenticity is the provider's signature verification
 * inside parseWebhook. Noop returns null → 200 no-op.
 */
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENTS_REPOSITORY) private readonly repo: PaymentsRepository,
    @Inject(PaymentFulfillmentService) private readonly fulfillment: PaymentFulfillmentService
  ) {}

  @Post('webhook')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const event = await this.provider.parseWebhook(raw, headers);
    if (!event) return { ok: true };
    const found = await this.repo.findOrderByProviderPaymentId(event.providerPaymentId);
    if (!found) return { ok: true };
    const { tenantId, order, payment } = found;
    if (event.status === 'succeeded') {
      if (payment.status !== 'succeeded') {
        await this.repo.updatePaymentStatus(
          tenantId,
          payment.id,
          'succeeded',
          new Date().toISOString()
        );
      }
      if (order.status === 'awaiting_payment') {
        await this.repo.updateOrderStatus(tenantId, order.id, 'paid');
      }
      const paid = await this.repo.getOrder(tenantId, order.id);
      if (paid) await this.fulfillment.fulfill(paid, { tenantId, userId: order.createdBy } as any);
    } else {
      await this.repo.updatePaymentStatus(tenantId, payment.id, event.status);
    }
    return { ok: true };
  }
}
