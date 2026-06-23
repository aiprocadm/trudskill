import type {
  CreateOrderSeed,
  CreatePaymentSeed,
  PaymentsRepository
} from './payments.repository.js';
import type {
  ItemFulfillmentStatus,
  OrderEntity,
  OrderItemEntity,
  OrderStatus,
  PaymentEntity,
  PaymentProviderId,
  PaymentRowStatus
} from './payments.types.js';

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class InMemoryPaymentsRepository implements PaymentsRepository {
  private orders = new Map<string, OrderEntity>();
  private payments = new Map<string, PaymentEntity>();

  async createOrder(seed: CreateOrderSeed): Promise<OrderEntity> {
    const now = new Date().toISOString();
    const orderId = rid('ord');
    const items: OrderItemEntity[] = seed.items.map((i) => ({
      id: rid('oi'),
      tenantId: seed.tenantId,
      orderId,
      groupId: i.groupId,
      learnerId: i.learnerId,
      unitAmount: i.unitAmount,
      fulfillmentStatus: 'pending'
    }));
    const order: OrderEntity = {
      id: orderId,
      tenantId: seed.tenantId,
      buyerType: seed.buyerType,
      buyerId: seed.buyerId,
      status: 'awaiting_payment',
      currency: seed.currency,
      totalAmount: items.reduce((s, i) => s + i.unitAmount, 0),
      ...(seed.description ? { description: seed.description } : {}),
      items,
      ...(seed.createdBy ? { createdBy: seed.createdBy } : {}),
      createdAt: now,
      updatedAt: now
    };
    this.orders.set(orderId, order);
    return clone(order);
  }

  async getOrder(tenantId: string, orderId: string): Promise<OrderEntity | null> {
    const o = this.orders.get(orderId);
    return o && o.tenantId === tenantId ? clone(o) : null;
  }

  async listOrders(
    tenantId: string,
    filter: { status?: string; buyerId?: string }
  ): Promise<OrderEntity[]> {
    return [...this.orders.values()]
      .filter((o) => o.tenantId === tenantId)
      .filter((o) => (filter.status ? o.status === filter.status : true))
      .filter((o) => (filter.buyerId ? o.buyerId === filter.buyerId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  async updateOrderStatus(tenantId: string, orderId: string, status: OrderStatus): Promise<void> {
    const o = this.orders.get(orderId);
    if (o && o.tenantId === tenantId) {
      o.status = status;
      o.updatedAt = new Date().toISOString();
    }
  }

  async createPayment(seed: CreatePaymentSeed): Promise<PaymentEntity> {
    const now = new Date().toISOString();
    const payment: PaymentEntity = {
      id: rid('pay'),
      tenantId: seed.tenantId,
      orderId: seed.orderId,
      provider: seed.provider,
      ...(seed.providerPaymentId ? { providerPaymentId: seed.providerPaymentId } : {}),
      method: seed.method,
      status: seed.status,
      amount: seed.amount,
      ...(seed.confirmationUrl ? { confirmationUrl: seed.confirmationUrl } : {}),
      ...(seed.idempotencyKey ? { idempotencyKey: seed.idempotencyKey } : {}),
      rawPayload: seed.rawPayload ?? {},
      createdAt: now,
      updatedAt: now
    };
    this.payments.set(payment.id, payment);
    return clone(payment);
  }

  async updatePaymentStatus(
    tenantId: string,
    paymentId: string,
    status: PaymentRowStatus,
    paidAt?: string
  ): Promise<void> {
    const p = this.payments.get(paymentId);
    if (p && p.tenantId === tenantId) {
      p.status = status;
      if (paidAt) p.paidAt = paidAt;
      p.updatedAt = new Date().toISOString();
    }
  }

  async findOrderByProviderPaymentId(
    providerPaymentId: string,
    provider?: PaymentProviderId
  ): Promise<{ tenantId: string; order: OrderEntity; payment: PaymentEntity } | null> {
    const p = [...this.payments.values()].find(
      (x) =>
        x.providerPaymentId === providerPaymentId &&
        (provider === undefined || x.provider === provider)
    );
    if (!p) return null;
    const o = this.orders.get(p.orderId);
    if (!o) return null;
    return { tenantId: o.tenantId, order: clone(o), payment: clone(p) };
  }

  async markItemFulfilled(
    tenantId: string,
    itemId: string,
    status: ItemFulfillmentStatus,
    enrollmentId?: string
  ): Promise<void> {
    for (const o of this.orders.values()) {
      if (o.tenantId !== tenantId) continue;
      const item = o.items.find((i) => i.id === itemId);
      if (item) {
        item.fulfillmentStatus = status;
        if (enrollmentId) item.enrollmentId = enrollmentId;
        o.updatedAt = new Date().toISOString();
        return;
      }
    }
  }
}
