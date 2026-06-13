import { Inject, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';

import { PushSubscriptionService } from './push-subscription.service.js';
import { backendEnv } from '../../../env.js';

import type { WebPushNotification, WebPushSenderPort } from './web-push-sender.js';

/**
 * Real web-push sender (used when WEB_PUSH_ENABLED=true). Resolves recipient subscriptions
 * via PushSubscriptionService, sends each via the `web-push` lib, and prunes subscriptions the
 * push service reports as gone (404/410). Best-effort: never throws — push must not break the
 * email-delivery path it is fanned-out alongside.
 */
@Injectable()
export class WebPushSender implements WebPushSenderPort {
  private readonly logger = new Logger(WebPushSender.name);

  constructor(
    @Inject(PushSubscriptionService)
    private readonly subscriptions: PushSubscriptionService
  ) {
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
    const subs = this.subscriptions.listEndpointsForUsers(tenantId, userIds);
    if (subs.length === 0) {
      return;
    }
    const payload = JSON.stringify(notification);

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
            // Subscription expired/unsubscribed at the push service — prune it.
            this.subscriptions.removeByEndpoint(tenantId, sub.endpoint);
          } else {
            this.logger.warn(
              `web-push send failed (status ${statusCode ?? 'unknown'}) for endpoint ${sub.endpoint}`
            );
          }
        }
      })
    );
  }
}
