import { Inject, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';

import {
  listSubscriptionsForUsers,
  removeSubscriptionByEndpoint
} from './push-subscription-store.js';
import { backendEnv } from '../../../env.js';
import { MvpTenantRunner } from '../../mvp/infrastructure/mvp-tenant-runner.service.js';

import type { WebPushNotification, WebPushSenderPort } from './web-push-sender.js';

/**
 * Real web-push sender (used when WEB_PUSH_ENABLED=true). Singleton: loads the recipient's
 * subscriptions via MvpTenantRunner (reentrant per-tenant lock — safe to call inside the
 * dispatch request that already holds it), sends each via the `web-push` lib, and prunes
 * subscriptions the push service reports as gone (404/410) in a separate write-mode pass.
 * Best-effort: never throws — push must not break the email-delivery path it fans out alongside.
 */
@Injectable()
export class WebPushSender implements WebPushSenderPort {
  private readonly logger = new Logger(WebPushSender.name);

  constructor(@Inject(MvpTenantRunner) private readonly tenantRunner: MvpTenantRunner) {
    // VAPID keys are guaranteed present when WEB_PUSH_ENABLED=true (env superRefine).
    webpush.setVapidDetails(
      backendEnv.VAPID_SUBJECT,
      backendEnv.VAPID_PUBLIC_KEY ?? '',
      backendEnv.VAPID_PRIVATE_KEY ?? ''
    );
  }

  async sendToUsers(
    tenantId: string,
    userIds: string[],
    notification: WebPushNotification
  ): Promise<void> {
    const subs = await this.tenantRunner.runWithTenantState(tenantId, async (state) =>
      listSubscriptionsForUsers(state, tenantId, userIds)
    );
    if (subs.length === 0) {
      return;
    }
    const payload = JSON.stringify(notification);
    const staleEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription expired/unsubscribed at the push service — mark for pruning.
            staleEndpoints.push(sub.endpoint);
          } else {
            this.logger.warn(
              `web-push send failed (status ${statusCode ?? 'unknown'}) for endpoint ${sub.endpoint}`
            );
          }
        }
      })
    );

    if (staleEndpoints.length > 0) {
      await this.tenantRunner.runWithTenantStateAndSave(tenantId, async (state) => {
        for (const endpoint of staleEndpoints) {
          removeSubscriptionByEndpoint(state, tenantId, endpoint);
        }
      });
    }
  }
}
