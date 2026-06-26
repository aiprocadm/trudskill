import { Inject, Injectable, Logger } from '@nestjs/common';

import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';
import { MvpEnrollmentService } from '../mvp/mvp-enrollment.service.js';

import type { OrderEntity, OrderItemEntity } from './payments.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Fulfills a paid order by enrolling each PENDING item's learner into the
 * corresponding group via MvpEnrollmentService.enrollIntoGroup.
 *
 * CRITICAL: this runs OUTSIDE an HTTP request (mark-paid + webhook paths don't apply
 * MvpRequestPersistenceInterceptor), so it must NOT call the request-scoped MvpService
 * directly — its MVP_STATE would be empty (no learner/group hydrated, nothing saved).
 * MvpEnrollmentService hydrates tenant MVP state from Postgres via MvpTenantRunner, runs
 * createBulkEnrollments, and persists the mutated state under the per-tenant serial lock.
 *
 * enrollIntoGroup signature (async):
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
    @Inject(MvpEnrollmentService) private readonly enrollment: MvpEnrollmentService
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
        const outcome = await this.enrollment.enrollIntoGroup(
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
          // Mark 'enrolled' ONLY when a real enrollment id resolved. A learner that
          // failed (in outcome.errors, absent from the map) must stay 'pending' for a
          // retry — never 'enrolled' with a null enrollmentId.
          const enrollmentId = enrollmentByLearner.get(item.learnerId);
          if (enrollmentId) {
            await this.repo.markItemFulfilled(order.tenantId, item.id, 'enrolled', enrollmentId);
          }
        }
        if (outcome.errors.length > 0) {
          this.logger.error(
            `Partial fulfillment for order ${order.id} group ${groupId} (kept 'paid' for retry): ${JSON.stringify(
              outcome.errors
            )}`
          );
        }
      }

      // Complete the order ONLY when every item enrolled. If any item is still pending
      // (a learner failed), keep the order 'paid' so a retry re-attempts the rest —
      // do not falsely report a partially-fulfilled order as fulfilled.
      const refreshed = await this.repo.getOrder(order.tenantId, order.id);
      const stillPending = refreshed?.items.some((i) => i.fulfillmentStatus === 'pending') ?? false;
      if (!stillPending) {
        await this.repo.updateOrderStatus(order.tenantId, order.id, 'fulfilled');
      }
    } catch (err) {
      this.logger.error(
        `Fulfillment failed for order ${order.id} (kept 'paid' for retry): ${String(err)}`
      );
      // Fail-soft: swallow the error so the recorded payment is never lost.
    }
  }
}
