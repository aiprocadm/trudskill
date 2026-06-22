import { Controller, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PaymentProviderResolver } from './payment-provider-resolver.service.js';
import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';

import type { Request } from 'express';

/**
 * Unguarded payment webhook. The acquirer carries no JWT / x-tenant-id and POSTs to a public,
 * provider-specific URL: /payments/webhook/:providerCode. We pick the env-credentialed registry
 * instance for that code (creds are global → no tenant needed to parse), then resolve the order
 * by provider_payment_id → tenant. Authenticity is the adapter's signature/re-fetch check.
 */
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    @Inject(PaymentProviderResolver) private readonly resolver: PaymentProviderResolver,
    @Inject(PAYMENTS_REPOSITORY) private readonly repo: PaymentsRepository,
    @Inject(PaymentFulfillmentService) private readonly fulfillment: PaymentFulfillmentService
  ) {}

  @Post('webhook/:providerCode')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(
    @Param('providerCode') providerCode: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>
  ) {
    const provider = this.resolver.fromRegistry(providerCode);
    if (!provider) return { ok: true };
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const event = await provider.parseWebhook(raw, headers);
    const ack = () => provider.webhookAck?.(event, raw) ?? { ok: true };
    if (!event) return ack();
    const found = await this.repo.findOrderByProviderPaymentId(event.providerPaymentId);
    if (!found) return ack();
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
    return ack();
  }
}
