import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';

/**
 * Thin wrapper so service-layer errors carry a machine-readable code in `.message`
 * (matchable in unit tests) while still producing a 400 response with `{ code, message }`
 * envelope when caught by NestJS's exception filter.
 */
class PaymentBadRequestError extends BadRequestException {
  constructor(code: string, humanMessage: string) {
    super({ code, message: humanMessage });
    // Override Error.message so vitest `.toThrow(/code/)` can match it
    this.message = code;
  }
}

/**
 * Parallel to PaymentBadRequestError but for 403 ownership violations.
 */
class PaymentForbiddenError extends ForbiddenException {
  constructor(code: string, humanMessage: string) {
    super({ code, message: humanMessage });
    this.message = code;
  }
}

import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';
import { assertOrderTransition, canCancelOrder } from './payments.state-machine.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider
} from '../../infrastructure/payments/payment.provider.js';
import { AuditService } from '../audit/audit.service.js';

import type { CreateOrderRequest, MarkPaidRequest } from './payments.dto.js';
import type { OrderEntity } from './payments.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly repo: PaymentsRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PaymentFulfillmentService) private readonly fulfillment: PaymentFulfillmentService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async createOrder(
    tenantId: string,
    userId: string | undefined,
    req: CreateOrderRequest,
    ctx: RequestContext
  ): Promise<OrderEntity> {
    const order = await this.repo.createOrder({
      tenantId,
      buyerType: req.buyerType,
      buyerId: req.buyerId,
      currency: 'RUB',
      ...(req.description ? { description: req.description } : {}),
      ...(userId ? { createdBy: userId } : {}),
      items: req.items
    });

    this.audit.write({
      tenantId,
      actorId: userId,
      action: 'payments.order_created',
      entityType: 'payments.order',
      entityId: order.id,
      newValues: { totalAmount: order.totalAmount, items: order.items.length },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    return order;
  }

  async getOrder(tenantId: string, orderId: string): Promise<OrderEntity> {
    const order = await this.repo.getOrder(tenantId, orderId);
    if (!order) {
      throw new NotFoundException({ code: 'order_not_found', message: 'Заказ не найден' });
    }
    return order;
  }

  async listOrders(tenantId: string, filter: { status?: string; buyerId?: string }) {
    return this.repo.listOrders(tenantId, filter);
  }

  async pay(
    tenantId: string,
    orderId: string,
    ctx: RequestContext
  ): Promise<{ confirmationUrl?: string }> {
    const order = await this.getOrder(tenantId, orderId);
    if (order.buyerType === 'learner' && ctx.userId && order.buyerId !== ctx.userId) {
      throw new PaymentForbiddenError('order_access_denied', 'Заказ не принадлежит пользователю');
    }
    if (order.status !== 'awaiting_payment') {
      throw new PaymentBadRequestError('order_not_payable', 'Заказ не ожидает оплаты');
    }

    const result = await this.provider.createPayment({
      tenantId,
      orderId: order.id,
      amount: order.totalAmount,
      currency: order.currency,
      description: order.description ?? `Заказ ${order.id}`
    });

    if (result.status === 'disabled') {
      throw new PaymentBadRequestError('payment_disabled', 'Онлайн-оплата временно недоступна');
    }

    await this.repo.createPayment({
      tenantId,
      orderId: order.id,
      provider: this.provider.id as any,
      providerPaymentId: result.providerPaymentId,
      method: 'card',
      amount: order.totalAmount,
      status: 'pending',
      ...(result.confirmationUrl ? { confirmationUrl: result.confirmationUrl } : {})
    });

    return { confirmationUrl: result.confirmationUrl };
  }

  async markPaid(
    tenantId: string,
    userId: string | undefined,
    orderId: string,
    req: MarkPaidRequest,
    ctx: RequestContext
  ): Promise<OrderEntity> {
    const order = await this.getOrder(tenantId, orderId);
    // Throws InvalidOrderTransitionError (message contains 'invalid_order_transition') if not awaiting_payment
    assertOrderTransition(order.status, 'paid');

    const method = req.method ?? 'bank_transfer';

    await this.repo.createPayment({
      tenantId,
      orderId: order.id,
      provider: 'manual',
      method,
      amount: order.totalAmount,
      status: 'succeeded',
      idempotencyKey: `manual:${order.id}`
    });

    await this.repo.updateOrderStatus(tenantId, order.id, 'paid');

    this.audit.write({
      tenantId,
      actorId: userId,
      action: 'payments.order_marked_paid',
      entityType: 'payments.order',
      entityId: order.id,
      oldValues: { status: order.status },
      newValues: { status: 'paid', method },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    const paid = await this.getOrder(tenantId, order.id);
    await this.fulfillment.fulfill(paid, ctx);
    return this.getOrder(tenantId, order.id);
  }

  async cancelOrder(
    tenantId: string,
    userId: string | undefined,
    orderId: string,
    ctx: RequestContext
  ): Promise<OrderEntity> {
    const order = await this.getOrder(tenantId, orderId);
    if (!canCancelOrder(order.status)) {
      throw new PaymentBadRequestError('cannot_cancel', 'Заказ нельзя отменить в текущем статусе');
    }

    await this.repo.updateOrderStatus(tenantId, order.id, 'cancelled');

    this.audit.write({
      tenantId,
      actorId: userId,
      action: 'payments.order_cancelled',
      entityType: 'payments.order',
      entityId: order.id,
      oldValues: { status: order.status },
      newValues: { status: 'cancelled' },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    return this.getOrder(tenantId, order.id);
  }
}
