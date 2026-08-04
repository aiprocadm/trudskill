import { apiRequest } from '../../lib/api/client';

import type { TenantUsageDto } from './types';
import type { UserSession } from '../../entities/session/model';

/** ФТ-D4.2: использование тарифа — право tenant.usage.read (0076). */
export const usageApi = {
  get: (session: UserSession) =>
    apiRequest<TenantUsageDto>('/tenant/usage', {
      auth: {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId,
        userId: session.user.id
      }
    })
};
