import { apiRequest } from '../../lib/api/client';
import { withAuth } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';
import type { Direction } from '../mvp/types';

export interface DirectionPayload {
  code?: string;
  name?: string;
  parentDirectionId?: string | null;
  sortOrder?: number;
  note?: string | null;
  status?: 'active' | 'archived';
}

/** МГ-E1.1 (срез 15.2): направления — создание, правка, архив и возврат (статусом). */
export const directionsApi = {
  create: (session: UserSession, payload: DirectionPayload): Promise<Direction> =>
    apiRequest<Direction>('/directions', { method: 'POST', body: payload, ...withAuth(session) }),

  update: (session: UserSession, id: string, payload: DirectionPayload): Promise<Direction> =>
    apiRequest<Direction>(`/directions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload,
      ...withAuth(session)
    })
};
