import { Injectable } from '@nestjs/common';

import type { WebPushNotification, WebPushSenderPort } from './web-push-sender.js';

/**
 * Default web-push sender for any environment where WEB_PUSH_ENABLED=false.
 * No-op: keeps the dispatcher fan-out path exercised without touching the `web-push`
 * library or VAPID keys. Mirrors NoopMailer.
 */
@Injectable()
export class NoopWebPushSender implements WebPushSenderPort {
  async sendToUsers(
    _tenantId: string,
    _userIds: string[],
    _notification: WebPushNotification
  ): Promise<void> {
    return Promise.resolve();
  }
}
