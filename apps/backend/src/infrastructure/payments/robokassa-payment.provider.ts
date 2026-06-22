import { createHash } from 'node:crypto';

import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

export interface RobokassaConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  payUrl: string;
}

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex');
}

/** Robokassa requires a positive 31-bit integer InvId; derive a stable one from the UUID order id. */
export function orderToInvId(orderId: string): number {
  const hex = createHash('sha256').update(orderId).digest('hex').slice(0, 8);
  return parseInt(hex, 16) & 0x7fffffff || 1;
}

export class RobokassaProvider implements PaymentProvider {
  readonly code = 'robokassa' as const;

  constructor(private readonly cfg: RobokassaConfig) {}

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const outSum = (params.amount / 100).toFixed(2);
    const invId = orderToInvId(params.orderId);
    const signature = md5(`${this.cfg.merchantLogin}:${outSum}:${invId}:${this.cfg.password1}`);
    const url = new URL(this.cfg.payUrl);
    url.searchParams.set('MerchantLogin', this.cfg.merchantLogin);
    url.searchParams.set('OutSum', outSum);
    url.searchParams.set('InvId', String(invId));
    url.searchParams.set('Description', params.description);
    url.searchParams.set('SignatureValue', signature);
    return { providerPaymentId: String(invId), status: 'pending', confirmationUrl: url.toString() };
  }

  async parseWebhook(raw: Buffer): Promise<WebhookEvent | null> {
    const params = new URLSearchParams(raw.toString('utf8'));
    const outSum = params.get('OutSum');
    const invId = params.get('InvId');
    const sig = params.get('SignatureValue');
    if (!outSum || !invId || !sig) return null;
    const expected = md5(`${outSum}:${invId}:${this.cfg.password2}`);
    if (sig.toLowerCase() !== expected.toLowerCase()) return null;
    return {
      providerPaymentId: invId,
      status: 'succeeded',
      rawPayload: Object.fromEntries(params.entries())
    };
  }

  webhookAck(event: WebhookEvent | null): string {
    return event ? `OK${event.providerPaymentId}` : 'OK';
  }
}
