import { apiRequest } from '../../lib/api/client';

import type { TenantBrandingDto } from './theme';
import type { UserSession } from '../../entities/session/model';

/** ФТ-D3.1: чтение — любому пользователю тенанта, запись — tenant.branding.configure. */

export interface BrandingResponse {
  branding: TenantBrandingDto;
  isDefault: boolean;
}

/** Пустая строка = сброс поля к дефолту (сервер трактует так же). */
export type BrandingUpdateInput = Partial<
  Record<'displayName' | 'logoUrl' | 'brandColor' | 'accentColor', string>
>;

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const brandingApi = {
  get: (session: UserSession) =>
    apiRequest<BrandingResponse>('/tenant/branding', { auth: auth(session) }),

  update: (session: UserSession, input: BrandingUpdateInput) =>
    apiRequest<BrandingResponse>('/tenant/branding', {
      method: 'PUT',
      body: input,
      auth: auth(session)
    })
};
