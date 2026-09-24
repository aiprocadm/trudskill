import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Справочники личного дела (ТЗ перехода МГ-C1.2; срез 8.13): должности центра с подсказками
 * и созданием, уровни образования ФРДО, страны. Права — те же, что у карточки слушателя.
 */
export interface PositionItem {
  id: string;
  name: string;
}

export interface CodeNameItem {
  code: string;
  name: string;
}

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const lookupApi = {
  positions: (session: UserSession, q: string): Promise<{ items: PositionItem[] }> =>
    apiRequest<{ items: PositionItem[] }>(
      q.trim() ? `/lookup/positions?q=${encodeURIComponent(q.trim())}` : '/lookup/positions',
      { method: 'GET', ...withAuth(session) }
    ),
  createPosition: (session: UserSession, name: string): Promise<{ name: string }> =>
    apiRequest<{ name: string }>('/lookup/positions', {
      method: 'POST',
      body: { name },
      ...withAuth(session)
    }),
  educationLevels: (session: UserSession): Promise<{ items: CodeNameItem[] }> =>
    apiRequest<{ items: CodeNameItem[] }>('/lookup/education-levels', {
      method: 'GET',
      ...withAuth(session)
    }),
  countries: (session: UserSession): Promise<{ items: CodeNameItem[] }> =>
    apiRequest<{ items: CodeNameItem[] }>('/lookup/countries', {
      method: 'GET',
      ...withAuth(session)
    })
};
