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

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Черновик',
  awaiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  fulfilled: 'Выполнен',
  cancelled: 'Отменён'
};
