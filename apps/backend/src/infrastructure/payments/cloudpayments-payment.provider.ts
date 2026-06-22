import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

export interface CloudPaymentsConfig {
  publicId: string;
  apiSecret: string;
  apiBase: string;
}

export class CloudPaymentsProvider implements PaymentProvider {
  readonly code = 'cloudpayments' as const;

  constructor(
    private readonly cfg: CloudPaymentsConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.cfg.publicId}:${this.cfg.apiSecret}`).toString('base64');
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const res = await this.fetchImpl(`${this.cfg.apiBase}/orders/create`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Amount: params.amount / 100, // CloudPayments Amount is major units
        Currency: params.currency,
        Description: params.description,
        JsonData: { orderId: params.orderId, tenantId: params.tenantId }
      })
    });
    const body = (await res.json()) as {
      Success?: boolean;
      Model?: { Id?: string; Number?: string; Url?: string };
      Message?: string;
    };
    if (!res.ok || body.Success !== true || !body.Model?.Id) {
      throw new Error(`cloudpayments order failed: ${body.Message ?? res.status}`);
    }
    return {
      providerPaymentId: String(body.Model.Id),
      status: 'pending',
      ...(body.Model.Url ? { confirmationUrl: body.Model.Url } : {})
    };
  }

  async parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null> {
    const provided = headers['content-hmac'];
    if (!provided) return null;
    const expected = createHmac('sha256', this.cfg.apiSecret).update(raw).digest('base64');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
    const id = body.TransactionId ?? body.InvoiceId;
    if (id === undefined || id === null) return null;
    const st = String(body.Status ?? '');
    const status =
      st === 'Completed' || st === 'Authorized'
        ? ('succeeded' as const)
        : st === 'Cancelled' || st === 'Declined'
          ? ('cancelled' as const)
          : null;
    if (!status) return null;
    return { providerPaymentId: String(id), status, rawPayload: body };
  }

  webhookAck(): Record<string, unknown> {
    return { code: 0 };
  }
}
