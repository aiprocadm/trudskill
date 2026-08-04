import { apiRequest } from '../../lib/api/client';

import type { PlatformTenantDto, PlatformTenantStatus } from './types';
import type { CurrentUser, UserSession } from '../../entities/session/model';
import type { LoginResponse, MeResponse } from '../../lib/api/types';
import type { RoleDto } from '../../lib/auth/auth-api';

/**
 * ФТ-D2.2 (срез 3): API платформенной админки. Все ручки — под правами
 * `platform.tenants.*` / `platform.impersonate`, которые есть только у platform_admin.
 */

export interface CreatePlatformTenantInput {
  code: string;
  name: string;
  status?: PlatformTenantStatus;
}

export interface ImpersonateResponse {
  tenantId: string;
  userId: string;
  /** Публичные токены (refresh уходит cookie, как у /auth/login). */
  session: LoginResponse;
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const platformTenantsApi = {
  list: (session: UserSession) =>
    apiRequest<PlatformTenantDto[]>('/platform/tenants', { auth: auth(session) }),

  create: (session: UserSession, input: CreatePlatformTenantInput) =>
    apiRequest<PlatformTenantDto>('/platform/tenants', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  changeStatus: (session: UserSession, id: string, status: PlatformTenantStatus) =>
    apiRequest<PlatformTenantDto>(`/platform/tenants/${id}/status`, {
      method: 'PATCH',
      body: { status },
      auth: auth(session)
    }),

  impersonate: (session: UserSession, id: string, userId?: string) =>
    apiRequest<ImpersonateResponse>(`/platform/tenants/${id}/impersonate`, {
      method: 'POST',
      body: userId ? { userId } : {},
      auth: auth(session),
      credentials: 'include'
    }),

  // === ФТ-D4: тарифы платформы ===
  listPlans: (session: UserSession) =>
    apiRequest<PlatformPlanDto[]>('/platform/plans', { auth: auth(session) }),

  createPlan: (session: UserSession, input: CreatePlanInput) =>
    apiRequest<PlatformPlanDto>('/platform/plans', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  assignPlan: (session: UserSession, tenantId: string, planId: string) =>
    apiRequest<{ tenantId: string; planId: string; status: string }>(
      `/platform/tenants/${tenantId}/plan`,
      { method: 'POST', body: { planId }, auth: auth(session) }
    ),

  // === ФТ-D5.1: счета аренды ===
  listInvoices: (session: UserSession) =>
    apiRequest<RentalInvoiceDto[]>('/platform/rental-invoices', { auth: auth(session) }),

  issueInvoice: (session: UserSession, input: IssueInvoiceInput) =>
    apiRequest<RentalInvoiceDto>('/platform/rental-invoices', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  markInvoicePaid: (session: UserSession, invoiceId: string) =>
    apiRequest<RentalInvoiceDto>(`/platform/rental-invoices/${invoiceId}/paid`, {
      method: 'POST',
      auth: auth(session)
    })
};

/** ФТ-D5.1: счёт аренды. Суммы — в копейках (деньги дробным типом не ходят). */
export interface RentalInvoiceDto {
  id: string;
  tenantId: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  amountKopecks: number;
  currency: string;
  status: 'issued' | 'paid' | 'cancelled';
  dueAt: string;
  paidAt: string | null;
}

export interface IssueInvoiceInput {
  tenantId: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  amountKopecks: number;
  dueAt?: string;
}

export interface PlatformPlanDto {
  id: string;
  code: string;
  name: string;
  activeLearnersLimit: number | null;
  staffLimit: number | null;
  storageLimitBytes: number | null;
  features: { proctoring?: boolean; scorm?: boolean; api?: boolean; webinars?: boolean };
}

export interface CreatePlanInput {
  code: string;
  name: string;
  activeLearnersLimit?: number;
  staffLimit?: number;
  storageLimitBytes?: number;
  proctoring?: boolean;
  scorm?: boolean;
  api?: boolean;
  webinars?: boolean;
}

/**
 * Сборка UserSession целевого тенанта из токенов impersonate. Отличие от
 * hydrateSession логина: `/auth/me` и роли запрашиваются с ЯВНЫМ `x-tenant-id`
 * целевого тенанта — дефолтный заголовок клиента указывает на тенант платформы,
 * и TenantGuard отбил бы запрос как tenant_header_mismatch.
 */
export const hydrateImpersonatedSession = async (
  tokens: LoginResponse,
  tenantId: string
): Promise<UserSession> => {
  const requestAuth = { accessToken: tokens.accessToken, tenantId };
  const user = await apiRequest<MeResponse>('/auth/me', {
    auth: requestAuth,
    credentials: 'include'
  });
  const roles = await apiRequest<RoleDto[]>(`/users/${user.id}/roles`, {
    auth: requestAuth,
    credentials: 'include'
  });
  const currentUser: CurrentUser = user;
  return {
    user: currentUser,
    tokens,
    roles: roles.map((role) => role.code),
    permissions: user.permissions
  };
};
