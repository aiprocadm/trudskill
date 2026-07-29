import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Соглашение об электронном взаимодействии (ФТ-C1.1, Фаза 3 Task 3).
 *
 * Уровень 1 политики идентификации: слушатель принимает соглашение, и после этого его
 * клики «Ознакомлен», ответы на тесты и заявления считаются подписанными простой
 * электронной подписью.
 */

export interface AgreementDto {
  body: string | null;
  version: number | null;
}

export interface SignatureStatusDto {
  hasAgreement: boolean;
  agreementVersion?: number;
  acceptedAt?: string;
  /** Показать экран принятия: соглашение есть, а принятого текста нет либо он устарел. */
  acceptanceRequired: boolean;
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const esignatureApi = {
  agreement: (session: UserSession) =>
    apiRequest<AgreementDto>('/esignature/agreement', { auth: auth(session) }),

  status: (session: UserSession) =>
    apiRequest<SignatureStatusDto>('/esignature/status', { auth: auth(session) }),

  accept: (session: UserSession) =>
    apiRequest<{ agreementVersion: number; acceptedAt: string }>('/esignature/accept', {
      method: 'POST',
      auth: auth(session)
    }),

  /** Правка текста — только у администрации центра (право `esignature.configure`). */
  saveAgreement: (session: UserSession, body: string) =>
    apiRequest<AgreementDto>('/esignature/agreement', {
      method: 'POST',
      body: { body },
      auth: auth(session)
    })
};
