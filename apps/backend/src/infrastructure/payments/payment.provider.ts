/**
 * Provider-agnostic, MULTI-PROVIDER seam for course-purchase payments. The active provider is
 * chosen PER TENANT (see PaymentProviderResolver), not by one global env enum — mirroring the
 * webinar seam. Noop is the safe default while PAYMENTS_ENABLED=false and for any tenant with no
 * provider configured. Real adapters (ЮKassa, Tinkoff, CloudPayments, Robokassa) register into the
 * registry. All amounts are integer kopecks; major-unit conversion happens only inside an adapter.
 */
export type PaymentProviderCode =
  | 'noop'
  | 'fake'
  | 'yookassa'
  | 'tinkoff'
  | 'cloudpayments'
  | 'robokassa';

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';

export interface CreatePaymentParams {
  tenantId: string;
  orderId: string;
  /** Integer kopecks. */
  amount: number;
  currency: string;
  description: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  status: 'pending' | 'disabled';
  confirmationUrl?: string;
}

export interface WebhookEvent {
  providerPaymentId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  /** Stable provider code; also stored in the payments.provider column. */
  readonly code: PaymentProviderCode;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  /** Verifies authenticity internally; returns null for unrecognized/unverified payloads. */
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null>;
  /**
   * Optional provider-specific webhook ACK body. The acquirer retries unless it receives the body
   * it expects (Robokassa `OK{InvId}`, Tinkoff `OK`, CloudPayments `{code:0}`, ЮKassa any-200).
   * When omitted, the controller responds `{ ok: true }`.
   */
  webhookAck?(event: WebhookEvent | null, raw: Buffer): string | Record<string, unknown>;
}

/** DI token for the registry of all compiled-in providers. Mirrors WEBINAR_PROVIDER_REGISTRY. */
export const PAYMENT_PROVIDER_REGISTRY = Symbol('PAYMENT_PROVIDER_REGISTRY');
export type PaymentProviderRegistry = Map<PaymentProviderCode, PaymentProvider>;

export class NoopPaymentProvider implements PaymentProvider {
  readonly code = 'noop' as const;
  async createPayment(_params: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { providerPaymentId: '', status: 'disabled' };
  }
  async parseWebhook(): Promise<WebhookEvent | null> {
    return null;
  }
}
