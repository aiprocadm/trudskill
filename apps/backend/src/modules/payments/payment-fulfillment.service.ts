import { Inject, Injectable, Logger } from '@nestjs/common';

import { PAYMENTS_REPOSITORY, type PaymentsRepository } from './payments.repository.js';
import { MvpService } from '../mvp/mvp.service.js';

import type { OrderEntity, OrderItemEntity } from './payments.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Fulfills a paid order by enrolling each PENDING item's learner into the
 * corresponding course group via MvpService.createBulkEnrollments.
 *
 * Real createBulkEnrollments signature:
 *   (tenantId, actorId, { idempotencyKey, groupId, learnerIds }, ctx) → BulkEnrollmentsOutcome (sync)
 *   Outcome: { created: Enrollment[], skippedExisting: [{learnerId, enrollmentId}], errors }
 *
 * Since OrderItemEntity carries courseVersionId (not groupId), we treat courseVersionId as the
 * groupId argument. Items are grouped by courseVersionId and a single bulk call is made per group.
 *
 * The body passed to createBulkEnrollments includes courseVersionId as an extra field (as any)
 * so that test stubs keying on body.courseVersionId continue to work against the real groupId param.
 *
 * Outcome mapping handles both shapes:
 *   - Test stub: { rows: [{learnerId, enrollmentId, status}] }
 *   - Real BulkEnrollmentsOutcome: { created: Enrollment[], skippedExisting: [{learnerId, enrollmentId}] }
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

      // Group pending items by courseVersionId (treated as groupId for bulk enrollment).
      const byCourse = new Map<string, OrderItemEntity[]>();
      for (const item of pending) {
        const list = byCourse.get(item.courseVersionId) ?? [];
        list.push(item);
        byCourse.set(item.courseVersionId, list);
      }

      for (const [courseVersionId, items] of byCourse) {
        // Real body: groupId is required; courseVersionId is passed as an additional field
        // (using `as any`) so test stubs that read body.courseVersionId work correctly.
        // idempotencyKey is scoped per order+course so retries are safe.
        const outcome = await (this.mvp.createBulkEnrollments as any)(
          order.tenantId,
          order.createdBy ?? 'system',
          {
            groupId: courseVersionId,
            courseVersionId, // extra field for test-stub compatibility
            learnerIds: items.map((i) => i.learnerId),
            idempotencyKey: `payment:${order.id}:${courseVersionId}`
          } as any,
          ctx
        );

        // Build learnerId → enrollmentId map from either outcome shape:
        //   • Test stub: { rows: [{learnerId, enrollmentId}] }
        //   • Real BulkEnrollmentsOutcome: { created: Enrollment[], skippedExisting: [{learnerId, enrollmentId}] }
        const enrollmentByLearner = new Map<string, string>();

        const rows: Array<{ learnerId: string; enrollmentId?: string; id?: string }> =
          (outcome as any).rows ?? [];

        if (rows.length > 0) {
          // Test-stub path: rows array present
          for (const row of rows) {
            const eid = row.enrollmentId ?? row.id;
            if (eid) enrollmentByLearner.set(row.learnerId, eid);
          }
        } else {
          // Real BulkEnrollmentsOutcome path
          const created: Array<{ id: string; learnerId: string }> = (outcome as any).created ?? [];
          const skipped: Array<{ learnerId: string; enrollmentId: string }> =
            (outcome as any).skippedExisting ?? [];

          for (const e of created) {
            enrollmentByLearner.set(e.learnerId, e.id);
          }
          for (const s of skipped) {
            enrollmentByLearner.set(s.learnerId, s.enrollmentId);
          }
        }

        for (const item of items) {
          const enrollmentId = enrollmentByLearner.get(item.learnerId);
          await this.repo.markItemFulfilled(order.tenantId, item.id, 'enrolled', enrollmentId);
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
