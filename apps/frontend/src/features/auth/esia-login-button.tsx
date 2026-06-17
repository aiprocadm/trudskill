'use client';

import { frontendEnv } from '../../lib/config/env';

export const shouldShowEsiaButton = (enabled: boolean): boolean => enabled;

export const esiaAuthorizeUrl = (apiBaseUrl: string, tenantId: string): string =>
  `${apiBaseUrl}/auth/esia/authorize?purpose=login&tenant_id=${encodeURIComponent(tenantId)}`;

export function EsiaLoginButton({ tenantId }: { tenantId: string }) {
  if (!shouldShowEsiaButton(frontendEnv.NEXT_PUBLIC_ESIA_ENABLED)) return null;
  const href = esiaAuthorizeUrl(frontendEnv.NEXT_PUBLIC_API_BASE_URL, tenantId);
  return (
    <a className="ui-button ui-button--secondary" href={href} data-testid="esia-login">
      Войти через Госуслуги
    </a>
  );
}
