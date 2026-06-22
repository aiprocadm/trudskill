import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

/**
 * STAGING-ONLY payment provider. Produces a synthetic confirmation URL and accepts a synthetic
 * webhook WITHOUT any real acquiring, so dev/staging can exercise order → pay → webhook →
 * fulfillment end-to-end. FORBIDDEN in production by an env refinement (see env.schema.ts):
 * prod must never believe an order is paid when no money moved. The real ЮKassa adapter
 * replaces this behind the same PAYMENT_PROVIDER token.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly code = 'fake' as const;

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const providerPaymentId = `fake-pay:${params.orderId}`;
    return {
      providerPaymentId,
      status: 'pending',
      confirmationUrl: `https://staging.fake-pay.local/confirm?order=${params.orderId}`
    };
  }

  async parseWebhook(raw: Buffer): Promise<WebhookEvent | null> {
    try {
      const body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      const providerPaymentId = body.providerPaymentId;
      const status = body.status;
      if (
        typeof providerPaymentId !== 'string' ||
        (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled')
      ) {
        return null;
      }
      return { providerPaymentId, status, rawPayload: body };
    } catch {
      return null;
    }
  }
}
