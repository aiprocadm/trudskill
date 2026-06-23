import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

export interface TinkoffConfig {
  terminalKey: string;
  password: string;
  apiBase: string;
  successUrl: string;
}

/** SHA-256 over root-level scalar values, sorted by key, with Password folded in. */
export function tinkoffToken(params: Record<string, unknown>, password: string): string {
  const src: Record<string, unknown> = { ...params, Password: password };
  delete src.Token;
  const concat = Object.keys(src)
    .filter((k) => {
      const v = src[k];
      return v !== null && v !== undefined && typeof v !== 'object';
    })
    .sort()
    .map((k) => String(src[k]))
    .join('');
  return createHash('sha256').update(concat).digest('hex');
}

export class TinkoffPaymentProvider implements PaymentProvider {
  readonly code = 'tinkoff' as const;

  constructor(
    private readonly cfg: TinkoffConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const reqBody: Record<string, unknown> = {
      TerminalKey: this.cfg.terminalKey,
      Amount: params.amount, // Tinkoff Amount is kopecks (no conversion)
      OrderId: params.orderId,
      Description: params.description,
      ...(this.cfg.successUrl ? { SuccessURL: this.cfg.successUrl } : {})
    };
    reqBody.Token = tinkoffToken(reqBody, this.cfg.password);
    const res = await this.fetchImpl(`${this.cfg.apiBase}/v2/Init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    const body = (await res.json()) as {
      Success?: boolean;
      PaymentId?: string | number;
      PaymentURL?: string;
      Message?: string;
    };
    if (!res.ok || body.Success !== true || !body.PaymentId) {
      throw new Error(`tinkoff Init failed: ${body.Message ?? res.status}`);
    }
    return {
      providerPaymentId: String(body.PaymentId),
      status: 'pending',
      ...(body.PaymentURL ? { confirmationUrl: body.PaymentURL } : {})
    };
  }

  async parseWebhook(raw: Buffer): Promise<WebhookEvent | null> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
    if (body.TerminalKey !== this.cfg.terminalKey) return null;
    const token = body.Token;
    if (typeof token !== 'string') return null;
    const expected = tinkoffToken(body, this.cfg.password);
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const paymentId = body.PaymentId;
    if (paymentId === undefined || paymentId === null) return null;
    const status =
      body.Status === 'CONFIRMED' || body.Status === 'AUTHORIZED'
        ? ('succeeded' as const)
        : body.Status === 'REJECTED' || body.Status === 'CANCELED'
          ? ('cancelled' as const)
          : null;
    if (!status) return null;
    // Tinkoff Amount is already integer kopecks.
    const amount =
      typeof body.Amount === 'number' && Number.isFinite(body.Amount) ? body.Amount : undefined;
    return {
      providerPaymentId: String(paymentId),
      status,
      ...(amount !== undefined ? { amount } : {}),
      rawPayload: body
    };
  }

  webhookAck(): string {
    return 'OK';
  }
}
