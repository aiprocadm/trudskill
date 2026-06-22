import { isIP } from 'node:net';

import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent
} from './payment.provider.js';

export interface YookassaConfig {
  shopId: string;
  secretKey: string;
  returnUrl: string;
  apiBase: string;
  allowedIps: string[];
  ipCheckEnabled: boolean;
}

/** Integer kopecks → "1500.00". */
function kopecksToRubles(kopecks: number): string {
  return (kopecks / 100).toFixed(2);
}

export class YookassaPaymentProvider implements PaymentProvider {
  readonly code = 'yookassa' as const;

  constructor(
    private readonly cfg: YookassaConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.cfg.shopId}:${this.cfg.secretKey}`).toString('base64');
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const res = await this.fetchImpl(`${this.cfg.apiBase}/payments`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Idempotence-Key': params.orderId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { value: kopecksToRubles(params.amount), currency: params.currency },
        capture: true,
        confirmation: { type: 'redirect', return_url: this.cfg.returnUrl },
        description: params.description,
        metadata: { orderId: params.orderId, tenantId: params.tenantId }
      })
    });
    if (!res.ok) {
      throw new Error(`yookassa createPayment failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      id: string;
      confirmation?: { confirmation_url?: string };
    };
    return {
      providerPaymentId: body.id,
      status: 'pending',
      ...(body.confirmation?.confirmation_url
        ? { confirmationUrl: body.confirmation.confirmation_url }
        : {})
    };
  }

  async parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null> {
    let body: { type?: string; event?: string; object?: { id?: string } };
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
    const known = ['payment.succeeded', 'payment.canceled', 'refund.succeeded'];
    if (body.type !== 'notification' || !body.event || !known.includes(body.event)) return null;
    const id = body.object?.id;
    if (typeof id !== 'string') return null;

    if (this.cfg.ipCheckEnabled) {
      const ip = this.clientIp(headers);
      if (ip && !this.ipAllowed(ip)) return null; // fail-open if ip indeterminable
    }

    // Re-fetch: trust the authenticated API response, not the notification body.
    const res = await this.fetchImpl(`${this.cfg.apiBase}/payments/${id}`, {
      headers: { Authorization: this.authHeader() }
    });
    if (!res.ok) return null;
    const payment = (await res.json()) as { id: string; status: string };
    const status =
      payment.status === 'succeeded'
        ? ('succeeded' as const)
        : payment.status === 'canceled'
          ? ('cancelled' as const)
          : null;
    if (!status) return null;
    return { providerPaymentId: payment.id, status, rawPayload: body as Record<string, unknown> };
  }

  private clientIp(headers: Record<string, string | undefined>): string | null {
    const xff = headers['x-forwarded-for'];
    if (!xff) return null;
    const first = xff.split(',')[0]?.trim();
    return first && isIP(first) ? first : null;
  }

  /** Minimal allowlist check: exact match or a /N CIDR over IPv4. IPv6 CIDRs are skipped (re-fetch is the real gate). */
  private ipAllowed(ip: string): boolean {
    return this.cfg.allowedIps.some((entry) => {
      if (!entry.includes('/')) return entry === ip;
      const parts = entry.split('/');
      const base = parts[0];
      const bitsRaw = parts[1];
      if (base === undefined || bitsRaw === undefined) return false;
      const bits = Number(bitsRaw);
      if (isIP(base) === 4 && isIP(ip) === 4) {
        const toInt = (a: string) =>
          a.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (toInt(ip) & mask) === (toInt(base) & mask);
      }
      return false;
    });
  }
}
