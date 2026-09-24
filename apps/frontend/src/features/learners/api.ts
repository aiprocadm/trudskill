import { apiRequest } from '../../lib/api/client';
import { frontendEnv } from '../../lib/config/env';

import type {
  LearnerAccessOutcome,
  LearnerErasureReport,
  LearnerFile,
  LearnerFileUploadIntent,
  LearnerFilesList,
  LearnerHistory,
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

/** Параметры реестра под именами, которые читает сервер (сторож «фильтры доходят до сервера»). */
export const learnersListParams = (filters: LearnersListFilters): URLSearchParams => {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  /* МГ-C3.2 (срез 11.2): компания, группа, без почты, не входил. */
  if (filters.companyId) params.set('client_id', filters.companyId);
  if (filters.groupId) params.set('group_id', filters.groupId);
  if (filters.noEmail) params.set('no_email', '1');
  if (filters.neverLoggedIn) params.set('never_logged_in', '1');
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.pageSize !== undefined) params.set('page_size', String(filters.pageSize));
  return params;
};

/**
 * Выгрузка реестра в XLSX (МГ-C3.2, РМ105): сервер отдаёт файл, а не конверт API — мимо
 * `apiRequest`, object-URL для скачивания; фильтры те же, что у списка, без страницы.
 */
export async function fetchLearnersXlsxUrl(
  session: UserSession,
  filters: LearnersListFilters
): Promise<string> {
  const rest: LearnersListFilters = { ...filters };
  delete rest.page;
  delete rest.pageSize;
  const params = learnersListParams(rest);
  const qs = params.toString();
  const res = await fetch(
    `${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/learners/export.xlsx${qs ? `?${qs}` : ''}`,
    {
      headers: {
        authorization: `Bearer ${session.tokens.accessToken}`,
        'x-tenant-id': session.user.tenantId
      }
    }
  );
  if (!res.ok) throw new Error(`Не удалось выгрузить реестр (HTTP ${res.status})`);
  return URL.createObjectURL(await res.blob());
}

export const learnersApi = {
  list: (session: UserSession, filters: LearnersListFilters): Promise<LearnersListResponse> => {
    const qs = learnersListParams(filters).toString();
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
  /** «Выслать доступ» (МГ-C2.1, срез 9.3): письмо со ссылкой для входа на почту слушателя. */
  sendAccess: (session: UserSession, learnerId: string): Promise<LearnerAccessOutcome> =>
    apiRequest<LearnerAccessOutcome>(`/learners/${learnerId}/access/send`, {
      method: 'POST',
      body: {},
      ...withAuth(session)
    }),
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

/** История слушателя для вкладки карточки (МГ-C2.1, срез 9.1, РМ91). */
export const learnerHistoryApi = {
  fetch: (session: UserSession, learnerId: string): Promise<LearnerHistory> =>
    apiRequest<LearnerHistory>(`/learners/${learnerId}/history`, withAuth(session))
};

/**
 * Дело слушателя одним PDF (ФТ-C2, журнал 641): сервер отдаёт файл, а не конверт API, поэтому
 * идём мимо `apiRequest` и возвращаем object-URL для открытия во вкладке.
 */
export async function fetchLearnerDossierPdfUrl(
  session: UserSession,
  learnerId: string
): Promise<string> {
  const res = await fetch(
    `${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/learners/${learnerId}/dossier.pdf`,
    {
      headers: {
        authorization: `Bearer ${session.tokens.accessToken}`,
        'x-tenant-id': session.user.tenantId
      }
    }
  );
  if (!res.ok) throw new Error(`Не удалось собрать личное дело (HTTP ${res.status})`);
  return URL.createObjectURL(await res.blob());
}

/** Файлы личного дела (МГ-C2.1, срез 9.2): два шага загрузки, как у всех файлов платформы. */
export const learnerFilesApi = {
  list: (session: UserSession, learnerId: string): Promise<LearnerFilesList> =>
    apiRequest<LearnerFilesList>(`/learners/${learnerId}/files`, withAuth(session)),
  uploadUrl: (
    session: UserSession,
    learnerId: string,
    input: { originalName: string; contentType: string; sizeBytes: number }
  ): Promise<LearnerFileUploadIntent> =>
    apiRequest<LearnerFileUploadIntent>(`/learners/${learnerId}/files/upload-url`, {
      method: 'POST',
      body: input,
      ...withAuth(session)
    }),
  attach: (session: UserSession, learnerId: string, fileId: string): Promise<LearnerFile> =>
    apiRequest<LearnerFile>(`/learners/${learnerId}/files`, {
      method: 'POST',
      body: { fileId },
      ...withAuth(session)
    }),
  downloadUrl: (
    session: UserSession,
    learnerId: string,
    fileId: string
  ): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(
      `/learners/${learnerId}/files/${fileId}/download-url`,
      withAuth(session)
    ),
  remove: (
    session: UserSession,
    learnerId: string,
    fileId: string
  ): Promise<{ removed: boolean }> =>
    apiRequest<{ removed: boolean }>(`/learners/${learnerId}/files/${fileId}`, {
      method: 'DELETE',
      ...withAuth(session)
    })
};
