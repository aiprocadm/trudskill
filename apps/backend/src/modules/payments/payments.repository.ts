import type {
  ItemFulfillmentStatus,
  OrderEntity,
  OrderStatus,
  PaymentEntity,
  PaymentMethod,
  PaymentProviderId,
  PaymentRowStatus
} from './payments.types.js';

export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');

export interface CreateOrderSeed {
  tenantId: string;
  buyerType: 'learner' | 'counterparty';
  buyerId: string;
  currency: string;
  description?: string;
  createdBy?: string;
  items: { groupId: string; learnerId: string; unitAmount: number }[];
}

export interface CreatePaymentSeed {
  tenantId: string;
  orderId: string;
  provider: PaymentProviderId;
  providerPaymentId?: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentRowStatus;
  confirmationUrl?: string;
  idempotencyKey?: string;
  rawPayload?: Record<string, unknown>;
}

export interface PaymentsRepository {
  createOrder(seed: CreateOrderSeed): Promise<OrderEntity>;
  getOrder(tenantId: string, orderId: string): Promise<OrderEntity | null>;
  listOrders(
    tenantId: string,
    filter: { status?: string; buyerId?: string }
  ): Promise<OrderEntity[]>;
  updateOrderStatus(tenantId: string, orderId: string, status: OrderStatus): Promise<void>;
  createPayment(seed: CreatePaymentSeed): Promise<PaymentEntity>;
  updatePaymentStatus(
    tenantId: string,
    paymentId: string,
    status: PaymentRowStatus,
    paidAt?: string
  ): Promise<void>;
  findOrderByProviderPaymentId(
    providerPaymentId: string
  ): Promise<{ tenantId: string; order: OrderEntity; payment: PaymentEntity } | null>;
  markItemFulfilled(
    tenantId: string,
    itemId: string,
    status: ItemFulfillmentStatus,
    enrollmentId?: string
  ): Promise<void>;
}
