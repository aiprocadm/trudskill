import { apiRequest } from '../../lib/api/client';

import type {
  ClientListItem,
  ClientProgressSummary,
  ClientsListFilters,
  ClientsListResponse,
  CreateClientPayload,
  GroupProgressSummary,
  UpdateClientPayload
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const clientsApi = {
  list: (session: UserSession, filters: ClientsListFilters): Promise<ClientsListResponse> => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.page !== undefined) params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params.set('page_size', String(filters.pageSize));
    const qs = params.toString();
    return apiRequest<ClientsListResponse>(qs ? `/counterparties?${qs}` : '/counterparties', {
      method: 'GET',
      ...withAuth(session)
    });
  },

  get: (session: UserSession, id: string): Promise<ClientListItem> =>
    apiRequest<ClientListItem>(`/counterparties/${id}`, {
      method: 'GET',
      ...withAuth(session)
    }),

  create: (session: UserSession, payload: CreateClientPayload): Promise<ClientListItem> =>
    apiRequest<ClientListItem>('/counterparties/extended', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  updateProfile: (
    session: UserSession,
    id: string,
    payload: UpdateClientPayload
  ): Promise<ClientListItem> =>
    apiRequest<ClientListItem>(`/counterparties/${id}/profile`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),

  getProgressSummary: (session: UserSession, id: string): Promise<ClientProgressSummary> =>
    apiRequest<ClientProgressSummary>(`/counterparties/${id}/progress-summary`, {
      method: 'GET',
      ...withAuth(session)
    }),

  setGroupCounterparty: (
    session: UserSession,
    groupId: string,
    counterpartyId: string | null
  ): Promise<void> =>
    apiRequest<void>(`/groups/${groupId}/counterparty`, {
      method: 'PATCH',
      body: { counterpartyId },
      ...withAuth(session)
    }),

  getGroupProgressSummary: (session: UserSession, groupId: string): Promise<GroupProgressSummary> =>
    apiRequest<GroupProgressSummary>(`/groups/${groupId}/progress-summary`, {
      method: 'GET',
      ...withAuth(session)
    })
};
