import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/** Представление с сервера (МГ-H4.1): своё или общее центра. */
export interface SavedViewDto {
  id: string;
  entity: string;
  name: string;
  scope: 'private' | 'tenant';
  filters: Record<string, string>;
  columns: string[];
  sort?: string;
  own: boolean;
}

export interface CreateSavedViewPayload {
  entity: string;
  name: string;
  filters: Record<string, string>;
  columns?: string[];
  sort?: string;
}

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

/** Сохранённые представления реестров на сервере (МГ-H4.1, срез 11.3) — вместо `localStorage`. */
export const savedViewsApi = {
  list: (session: UserSession, entity: string): Promise<SavedViewDto[]> =>
    apiRequest<SavedViewDto[]>(
      `/saved-views?entity=${encodeURIComponent(entity)}`,
      withAuth(session)
    ),
  create: (session: UserSession, payload: CreateSavedViewPayload): Promise<SavedViewDto> =>
    apiRequest<SavedViewDto>('/saved-views', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  createShared: (session: UserSession, payload: CreateSavedViewPayload): Promise<SavedViewDto> =>
    apiRequest<SavedViewDto>('/saved-views/shared', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  remove: (session: UserSession, id: string, shared: boolean): Promise<{ removed: boolean }> =>
    apiRequest<{ removed: boolean }>(`/saved-views/${shared ? 'shared/' : ''}${id}`, {
      method: 'DELETE',
      ...withAuth(session)
    })
};
