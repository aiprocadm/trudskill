import type { OrderStatus } from './payments.types.js';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['fulfilled'],
  fulfilled: [],
  cancelled: []
};

export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`invalid_order_transition: ${from} → ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export function canCancelOrder(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].includes('cancelled');
}
