import { apiRequest } from '../api/client';

import type { UserSession } from '../../entities/session/model';

const auth = (session: UserSession) => ({
  auth: { userId: session.user.id, tenantId: session.user.tenantId, accessToken: session.tokens.accessToken }
});

export interface TenantMe {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface TenantSettingsDto {
  tenantId: string;
  locale: string;
  timezone: string;
  payload: Record<string, unknown>;
}

export interface TenantRequisitesDto {
  tenantId: string;
  legalName: string;
  taxNumber: string;
  payload: Record<string, unknown>;
}

export interface CommissionMemberDto {
  id: string;
  tenantId: string;
  displayName: string;
  position?: string;
  userId?: string;
}

export interface TenantCommissionDto {
  tenantId: string;
  chairMemberId?: string;
  secretaryMemberId?: string;
  members: CommissionMemberDto[];
}

export const tenantApi = {
  me: (session: UserSession) => apiRequest<TenantMe>('/tenant/me', auth(session)),
  settings: (session: UserSession) => apiRequest<TenantSettingsDto>('/tenant/settings', auth(session)),
  requisites: (session: UserSession) => apiRequest<TenantRequisitesDto>('/tenant/requisites', auth(session)),
  commission: (session: UserSession) => apiRequest<TenantCommissionDto>('/tenant/commission', auth(session))
};
