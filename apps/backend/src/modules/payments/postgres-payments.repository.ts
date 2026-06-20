import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type {
  CreateOrderSeed,
  CreatePaymentSeed,
  PaymentsRepository
} from './payments.repository.js';
import type {
  ItemFulfillmentStatus,
  OrderBuyerType,
  OrderEntity,
  OrderItemEntity,
  OrderStatus,
  PaymentEntity,
  PaymentMethod,
  PaymentProviderId,
  PaymentRowStatus
} from './payments.types.js';

interface OrderDbRow {
  id: string;
  tenant_id: string;
  buyer_type: string;
  buyer_id: string;
  status: string;
  currency: string;
  total_amount: string; // bigint → string from pg driver
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemDbRow {
  id: string;
  tenant_id: string;
  order_id: string;
  group_id: string;
  learner_id: string;
  unit_amount: string; // bigint → string from pg driver
  fulfillment_status: string;
  enrollment_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PaymentDbRow {
  id: string;
  tenant_id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  method: string;
  status: string;
  amount: string; // bigint → string from pg driver
  confirmation_url: string | null;
  paid_at: string | null;
  idempotency_key: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

@Injectable()
export class PostgresPaymentsRepository implements PaymentsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async createOrder(seed: CreateOrderSeed): Promise<OrderEntity> {
    const orderId = rid('ord');
    await this.db.query(
      `insert into payments.orders
         (id, tenant_id, buyer_type, buyer_id, status, currency, total_amount, description, created_by, created_at, updated_at)
       values ($1, $2, $3, $4, 'awaiting_payment', $5, $6, $7, $8, now(), now())`,
      [
        orderId,
        seed.tenantId,
        seed.buyerType,
        seed.buyerId,
        seed.currency,
        seed.items.reduce((s, i) => s + i.unitAmount, 0),
        seed.description ?? null,
        seed.createdBy ?? null
      ]
    );

    for (const i of seed.items) {
      await this.db.query(
        `insert into payments.order_items
           (id, tenant_id, order_id, group_id, learner_id, unit_amount, fulfillment_status, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, 'pending', now(), now())`,
        [rid('oi'), seed.tenantId, orderId, i.groupId, i.learnerId, i.unitAmount]
      );
    }

    const order = await this.getOrder(seed.tenantId, orderId);
    return order!;
  }

  async getOrder(tenantId: string, orderId: string): Promise<OrderEntity | null> {
    const orders = await this.db.query<OrderDbRow>(
      `select * from payments.orders where tenant_id = $1 and id = $2`,
      [tenantId, orderId]
    );
    if (!orders[0]) return null;

    const items = await this.db.query<OrderItemDbRow>(
      `select * from payments.order_items where order_id = $1 order by created_at asc`,
      [orderId]
    );

    return this.mapOrder(orders[0], items);
  }

  async listOrders(
    tenantId: string,
    filter: { status?: string; buyerId?: string }
  ): Promise<OrderEntity[]> {
    const conditions: string[] = ['o.tenant_id = $1'];
    const params: unknown[] = [tenantId];

    if (filter.status) {
      params.push(filter.status);
      conditions.push(`o.status = $${params.length}`);
    }
    if (filter.buyerId) {
      params.push(filter.buyerId);
      conditions.push(`o.buyer_id = $${params.length}`);
    }

    const orders = await this.db.query<OrderDbRow>(
      `select * from payments.orders o where ${conditions.join(' and ')} order by o.created_at desc`,
      params
    );

    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);
    const items = await this.db.query<OrderItemDbRow>(
      `select * from payments.order_items where order_id = any($1) order by created_at asc`,
      [orderIds]
    );

    const itemsByOrderId = new Map<string, OrderItemDbRow[]>();
    for (const item of items) {
      const list = itemsByOrderId.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.order_id, list);
    }

    return orders.map((o) => this.mapOrder(o, itemsByOrderId.get(o.id) ?? []));
  }

  async updateOrderStatus(tenantId: string, orderId: string, status: OrderStatus): Promise<void> {
    await this.db.query(
      `update payments.orders set status = $3, updated_at = now() where tenant_id = $1 and id = $2`,
      [tenantId, orderId, status]
    );
  }

  async createPayment(seed: CreatePaymentSeed): Promise<PaymentEntity> {
    const paymentId = rid('pay');
    const rows = await this.db.query<PaymentDbRow>(
      `insert into payments.payments
         (id, tenant_id, order_id, provider, provider_payment_id, method, status, amount,
          confirmation_url, idempotency_key, raw_payload, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
       returning *`,
      [
        paymentId,
        seed.tenantId,
        seed.orderId,
        seed.provider,
        seed.providerPaymentId ?? null,
        seed.method,
        seed.status,
        seed.amount,
        seed.confirmationUrl ?? null,
        seed.idempotencyKey ?? null,
        seed.rawPayload ?? {}
      ]
    );
    return this.mapPayment(rows[0]!);
  }

  async updatePaymentStatus(
    tenantId: string,
    paymentId: string,
    status: PaymentRowStatus,
    paidAt?: string
  ): Promise<void> {
    await this.db.query(
      `update payments.payments
         set status = $3, paid_at = coalesce($4, paid_at), updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, paymentId, status, paidAt ?? null]
    );
  }

  async findOrderByProviderPaymentId(
    providerPaymentId: string
  ): Promise<{ tenantId: string; order: OrderEntity; payment: PaymentEntity } | null> {
    const payments = await this.db.query<PaymentDbRow>(
      `select * from payments.payments where provider_payment_id = $1`,
      [providerPaymentId]
    );
    if (!payments[0]) return null;

    const payment = this.mapPayment(payments[0]);

    const orders = await this.db.query<OrderDbRow>(`select * from payments.orders where id = $1`, [
      payment.orderId
    ]);
    if (!orders[0]) return null;

    const items = await this.db.query<OrderItemDbRow>(
      `select * from payments.order_items where order_id = $1 order by created_at asc`,
      [payment.orderId]
    );

    const order = this.mapOrder(orders[0], items);
    return { tenantId: order.tenantId, order, payment };
  }

  async markItemFulfilled(
    tenantId: string,
    itemId: string,
    status: ItemFulfillmentStatus,
    enrollmentId?: string
  ): Promise<void> {
    await this.db.query(
      `update payments.order_items
         set fulfillment_status = $3, enrollment_id = coalesce($4, enrollment_id), updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, itemId, status, enrollmentId ?? null]
    );
  }

  private mapOrder(row: OrderDbRow, itemRows: OrderItemDbRow[]): OrderEntity {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      buyerType: row.buyer_type as OrderBuyerType,
      buyerId: row.buyer_id,
      status: row.status as OrderStatus,
      currency: row.currency,
      totalAmount: Number(row.total_amount),
      ...(row.description ? { description: row.description } : {}),
      items: itemRows.map((i) => this.mapOrderItem(i)),
      ...(row.created_by ? { createdBy: row.created_by } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapOrderItem(row: OrderItemDbRow): OrderItemEntity {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      groupId: row.group_id,
      learnerId: row.learner_id,
      unitAmount: Number(row.unit_amount),
      fulfillmentStatus: row.fulfillment_status as ItemFulfillmentStatus,
      ...(row.enrollment_id ? { enrollmentId: row.enrollment_id } : {})
    };
  }

  private mapPayment(row: PaymentDbRow): PaymentEntity {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      provider: row.provider as PaymentProviderId,
      ...(row.provider_payment_id ? { providerPaymentId: row.provider_payment_id } : {}),
      method: row.method as PaymentMethod,
      status: row.status as PaymentRowStatus,
      amount: Number(row.amount),
      ...(row.confirmation_url ? { confirmationUrl: row.confirmation_url } : {}),
      ...(row.paid_at ? { paidAt: row.paid_at } : {}),
      ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
      rawPayload: row.raw_payload,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
