import { apiRequest } from '../../lib/api/client';

import type {
  LearnerErasureReport,
  LearnerListItem,
  LearnerPassport,
  LearnersListFilters,
  LearnersListResponse,
  UpdateLearnerProfilePayload
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const learnersApi = {
  list: (session: UserSession, filters: LearnersListFilters): Promise<LearnersListResponse> => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.page !== undefined) params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params.set('page_size', String(filters.pageSize));
    const qs = params.toString();
    return apiRequest<LearnersListResponse>(qs ? `/learners?${qs}` : '/learners', {
      method: 'GET',
      ...withAuth(session)
    });
  },

  /**
   * Заведение слушателя поштучно.
   *
   * До среза 44 такого пути в интерфейсе не было вовсе: единственным способом добавить
   * человека оставался массовый импорт Excel — даже когда человек один. Ручка на сервере
   * при этом существовала (`POST /learners`, право `learners.write`).
   *
   * `name` уходит одной строкой «Фамилия Имя Отчество»: сервер разбирает её тем же
   * разбором, что и массовый импорт (`parseFullName`), поэтому карточка получается
   * одинаковой независимо от пути ввода.
   */
  create: (
    session: UserSession,
    payload: { name: string; code: string; organizationUnitId?: string }
  ): Promise<LearnerListItem> =>
    apiRequest<LearnerListItem>('/learners', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  updateProfile: (
    session: UserSession,
    learnerId: string,
    payload: UpdateLearnerProfilePayload
  ): Promise<LearnerListItem> =>
    apiRequest<LearnerListItem>(`/learners/${learnerId}/profile`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),

  /** МГ-C1.1: раскрытие СНИЛСа, паспорта и даты рождения по причине — право learners.pii.manage, каждое — в журнале. */
  revealPii: (
    session: UserSession,
    learnerId: string,
    reason: string
  ): Promise<{ snils?: string; passport?: LearnerPassport | string; birthDate?: string }> =>
    apiRequest(`/learners/${learnerId}/pii/reveal`, {
      method: 'POST',
      body: { reason },
      ...withAuth(session)
    }),

  /** ФТ-G6: выгрузка ПДн по заявлению субъекта (152-ФЗ ст. 14). */
  exportPersonalData: (session: UserSession, learnerId: string): Promise<unknown> =>
    apiRequest<unknown>(`/learners/${learnerId}/personal-data`, {
      method: 'GET',
      ...withAuth(session)
    }),

  /** ФТ-G6: обезличивание по отзыву согласия. POST, а не DELETE — документы остаются. */
  erasePersonalData: (
    session: UserSession,
    learnerId: string,
    reason?: string
  ): Promise<LearnerErasureReport> =>
    apiRequest<LearnerErasureReport>(`/learners/${learnerId}/personal-data/erasure`, {
      method: 'POST',
      body: reason ? { reason } : {},
      ...withAuth(session)
    })
};
