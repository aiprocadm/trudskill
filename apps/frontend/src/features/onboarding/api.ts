import { apiRequest } from '../../lib/api/client';

import type { OnboardingStatusDto } from './types';
import type { UserSession } from '../../entities/session/model';

/** ФТ-D2.3: статус онбординга считается сервером из реальных данных центра. */
export const onboardingApi = {
  get: (session: UserSession) =>
    apiRequest<OnboardingStatusDto>('/tenant/onboarding', {
      auth: {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId,
        userId: session.user.id
      }
    })
};
