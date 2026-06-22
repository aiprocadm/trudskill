export type OrderStatus = 'draft' | 'awaiting_payment' | 'paid' | 'fulfilled' | 'cancelled';

export interface OrderItem {
  id: string;
  groupId: string;
  learnerId: string;
  unitAmount: number;
  fulfillmentStatus: string;
  enrollmentId?: string;
}

export interface Order {
  id: string;
  buyerType: 'learner' | 'counterparty';
  buyerId: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number;
  description?: string;
  items: OrderItem[];
  createdAt: string;
}

export interface CreateOrderInput {
  buyerType: 'learner' | 'counterparty';
  buyerId: string;
  description?: string;
  items: { groupId: string; learnerId: string; unitAmount: number }[];
}

export interface MarkPaidInput {
  method?: 'manual' | 'bank_transfer';
  note?: string;
}

export type PaymentProviderCode =
  | 'noop'
  | 'fake'
  | 'yookassa'
  | 'tinkoff'
  | 'cloudpayments'
  | 'robokassa';

export interface PaymentProviderSettings {
  tenantId: string;
  providerCode: string;
  enabled: boolean;
  updatedAt: string;
}

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProviderCode, string> = {
  noop: 'Отключено (noop)',
  fake: 'Тестовый (fake)',
  yookassa: 'ЮKassa',
  tinkoff: 'Т-Касса',
  cloudpayments: 'CloudPayments',
  robokassa: 'Robokassa'
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Черновик',
  awaiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  fulfilled: 'Выполнен',
  cancelled: 'Отменён'
};
