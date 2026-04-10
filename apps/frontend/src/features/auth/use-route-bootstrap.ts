import { evaluateRouteAccess } from '../navigation/helpers';

import type { UserSession } from '../../entities/session/model';

export const getRouteBootstrapState = (path: string, session: UserSession | null) => {
  const access = evaluateRouteAccess(path, session);
  return {
    access,
    shouldRedirectToLogin: access.kind === 'redirect-login',
    shouldRedirectToForbidden: access.kind === 'forbidden',
    shouldRedirectToNotFound: access.kind === 'not-found'
  };
};
