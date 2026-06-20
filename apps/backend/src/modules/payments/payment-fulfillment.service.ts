import { Inject, Injectable, Logger } from '@nestjs/common';

import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';
import { MvpService } from '../mvp/mvp.service.js';

import type { OrderEntity, OrderItemEntity } from './payments.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Fulfills a paid order by enrolling each PENDING item's learner into the
 * corresponding group via MvpService.createBulkEnrollments.
 *
 * Real createBulkEnrollments signature (synchronous):
 *   (tenantId, actorId, { idempotencyKey, groupId, learnerIds }, ctx) → BulkEnrollmentsOutcome
 *   Outcome: { groupId, idempotencyKey, created: Enrollment[], skippedExisting: [{learnerId, enrollmentId}], errors }
 *
 * Items are grouped by groupId and a single bulk call is made per group.
 */
@Injectable()
export class PaymentFulfillmentService {
  private readonly logger = new Logger(PaymentFulfillmentService.name);

  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly repo: PaymentsRepository,
    @Inject(MvpService) private readonly mvp: MvpService
  ) {}

  async fulfill(order: OrderEntity, ctx: RequestContext): Promise<void> {
    try {
      const pending = order.items.filter((i) => i.fulfillmentStatus === 'pending');

      // Idempotent: if already fully processed, just ensure order is flipped to fulfilled.
      if (pending.length === 0) {
        if (order.status === 'paid') {
          await this.repo.updateOrderStatus(order.tenantId, order.id, 'fulfilled');
        }
        return;
      }

      const byGroup = new Map<string, OrderItemEntity[]>();
      for (const item of pending) {
        const list = byGroup.get(item.groupId) ?? [];
        list.push(item);
        byGroup.set(item.groupId, list);
      }

      for (const [groupId, items] of byGroup) {
        const outcome = this.mvp.createBulkEnrollments(
          order.tenantId,
          order.createdBy ?? 'system',
          {
            idempotencyKey: `payment:${order.id}:${groupId}`,
            groupId,
            learnerIds: items.map((i) => i.learnerId)
          },
          ctx
        );
        const enrollmentByLearner = new Map<string, string>();
        for (const e of outcome.created) enrollmentByLearner.set(e.learnerId, e.id);
        for (const s of outcome.skippedExisting)
          enrollmentByLearner.set(s.learnerId, s.enrollmentId);
        for (const item of items) {
          await this.repo.markItemFulfilled(
            order.tenantId,
            item.id,
            'enrolled',
            enrollmentByLearner.get(item.learnerId)
          );
        }
      }

      await this.repo.updateOrderStatus(order.tenantId, order.id, 'fulfilled');
    } catch (err) {
      this.logger.error(
        `Fulfillment failed for order ${order.id} (kept 'paid' for retry): ${String(err)}`
      );
      // Fail-soft: swallow the error so the recorded payment is never lost.
    }
  }
}
