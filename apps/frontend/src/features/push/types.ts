// Phase 10 Track C — web-push frontend contracts (mirror of backend DTOs).

/** Browser PushSubscription.toJSON() shape sent to POST /web-push/subscribe. */
export interface SubscribePushRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

/** GET /web-push/public-key response — drives whether the subscription UI is shown. */
export interface PublicKeyResponse {
  enabled: boolean;
  publicKey: string | null;
}

/** One stored browser subscription (subset returned by GET /web-push/subscriptions). */
export interface PushSubscriptionView {
  id: string;
  endpoint: string;
  userAgent?: string;
  createdAt: string;
}
