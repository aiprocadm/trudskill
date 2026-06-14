import { apiRequest } from '../../lib/api/client';

import type { PublicKeyResponse, PushSubscriptionView, SubscribePushRequest } from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

/** Phase 10 Track C — self-service web-push subscription endpoints (TenantGuard-only on backend). */
export const pushApi = {
  getPublicKey: (session: UserSession): Promise<PublicKeyResponse> =>
    apiRequest<PublicKeyResponse>('/web-push/public-key', withAuth(session)),

  listSubscriptions: (session: UserSession): Promise<PushSubscriptionView[]> =>
    apiRequest<PushSubscriptionView[]>('/web-push/subscriptions', withAuth(session)),

  subscribe: (session: UserSession, body: SubscribePushRequest): Promise<PushSubscriptionView> =>
    apiRequest<PushSubscriptionView>('/web-push/subscribe', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  unsubscribe: (session: UserSession, endpoint: string): Promise<{ ok: boolean }> =>
    apiRequest<{ ok: boolean }>('/web-push/subscribe', {
      method: 'DELETE',
      body: { endpoint },
      ...withAuth(session)
    })
};
