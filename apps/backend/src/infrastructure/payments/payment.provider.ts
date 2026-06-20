/**
 * Provider-agnostic seam for course-purchase payments, mirroring ExportSignatureProvider.
 * Noop is the safe default for dev/test and any env with PAYMENTS_ENABLED=false: online
 * payment is unavailable, but manual bank-transfer mark-paid still works. A ЮKassa adapter
 * plugs in later behind PAYMENT_PROVIDER. All amounts are integer kopecks.
 */
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
  /** Provider-side payment id; '' when disabled. */
  providerPaymentId: string;
  status: 'pending' | 'disabled';
  /** Redirect URL the buyer opens to pay. Set only when a real/fake provider is active. */
  confirmationUrl?: string;
}

export interface WebhookEvent {
  providerPaymentId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  /** Stable provider id ('noop' | 'fake' | 'yookassa'). */
  readonly id: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  /** Verifies signature internally; returns null for unrecognized/unsigned payloads. */
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebhookEvent | null>;
}

/** DI token for the active payment provider. Mirrors EXPORT_SIGNATURE_PROVIDER. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export class NoopPaymentProvider implements PaymentProvider {
  readonly id = 'noop';
  async createPayment(_params: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { providerPaymentId: '', status: 'disabled' };
  }
  async parseWebhook(): Promise<WebhookEvent | null> {
    return null;
  }
}
