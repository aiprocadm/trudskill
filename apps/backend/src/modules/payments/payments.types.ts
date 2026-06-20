export type OrderStatus = 'draft' | 'awaiting_payment' | 'paid' | 'fulfilled' | 'cancelled';
export type OrderBuyerType = 'learner' | 'counterparty';
export type ItemFulfillmentStatus = 'pending' | 'enrolled' | 'skipped';
export type PaymentRowStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
export type PaymentProviderId = 'manual' | 'noop' | 'fake' | 'yookassa';
export type PaymentMethod = 'manual' | 'bank_transfer' | 'card';

export interface OrderItemEntity {
  id: string;
  tenantId: string;
  orderId: string;
  groupId: string;
  learnerId: string;
  unitAmount: number; // kopecks
  fulfillmentStatus: ItemFulfillmentStatus;
  enrollmentId?: string;
}

export interface OrderEntity {
  id: string;
  tenantId: string;
  buyerType: OrderBuyerType;
  buyerId: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number; // kopecks
  description?: string;
  items: OrderItemEntity[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEntity {
  id: string;
  tenantId: string;
  orderId: string;
  provider: PaymentProviderId;
  providerPaymentId?: string;
  method: PaymentMethod;
  status: PaymentRowStatus;
  amount: number; // kopecks
  confirmationUrl?: string;
  paidAt?: string;
  idempotencyKey?: string;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
