import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Настройка нумераторов документов (ФТ-A4.1, Фаза 1 Task 6).
 *
 * Маска, стартовое значение и период сброса задаются per tenant per тип документа.
 * Раньше правило можно было создать только через API — админ УЦ, переносящий журнал
 * с бумаги, не мог ни продолжить нумерацию с нужного номера, ни увидеть текущую.
 */

/** Период обнуления счётчика: сквозная нумерация / с нового года / с нового месяца. */
export type NumberResetPeriod = 'none' | 'year' | 'month';

export interface NumberingRuleDto {
  id: string;
  documentType: string;
  prefix: string;
  suffix: string;
  pattern: string;
  currentCounter: number;
  resetPeriod: NumberResetPeriod;
  isActive: boolean;
  updatedAt: string;
}

export interface CreateNumberingRuleInput {
  documentType: string;
  prefix?: string;
  suffix?: string;
  pattern?: string;
  resetPeriod?: NumberResetPeriod;
  /** Номер, который выдастся первым (не «последний выданный»). */
  startCounter?: number;
}

export type UpdateNumberingRuleInput = Omit<CreateNumberingRuleInput, 'documentType'>;

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const numberingApi = {
  list: (session: UserSession) =>
    apiRequest<{ items: NumberingRuleDto[]; total: number }>('/numbering-rules', {
      auth: auth(session)
    }),

  create: (session: UserSession, input: CreateNumberingRuleInput) =>
    apiRequest<NumberingRuleDto>('/numbering-rules', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  update: (session: UserSession, id: string, input: UpdateNumberingRuleInput) =>
    apiRequest<NumberingRuleDto>(`/numbering-rules/${id}`, {
      method: 'PATCH',
      body: input,
      auth: auth(session)
    }),

  activate: (session: UserSession, id: string) =>
    apiRequest<NumberingRuleDto>(`/numbering-rules/${id}/activate`, {
      method: 'POST',
      auth: auth(session)
    }),

  deactivate: (session: UserSession, id: string) =>
    apiRequest<NumberingRuleDto>(`/numbering-rules/${id}/deactivate`, {
      method: 'POST',
      auth: auth(session)
    })
};

/**
 * Предпросмотр маски без обращения к серверу: админ должен видеть, что получится,
 * до сохранения правила. Повторяет серверную сборку номера (`reserveNumber`):
 * счётчик — 6 знаков с ведущими нулями, период подставляется только когда он есть.
 */
export function previewNumber(
  rule: Pick<NumberingRuleDto, 'prefix' | 'suffix' | 'pattern' | 'resetPeriod'>,
  nextCounter: number,
  now: Date = new Date()
): string {
  const periodKey =
    rule.resetPeriod === 'none'
      ? ''
      : rule.resetPeriod === 'year'
        ? `${now.getUTCFullYear()}`
        : `${now.getUTCFullYear()}-${`${now.getUTCMonth() + 1}`.padStart(2, '0')}`;
  // Сервер сам дописывает {period} в маску, если период включён, а маска его не
  // содержит — иначе после сброса номера столкнулись бы. Повторяем это здесь.
  const pattern =
    rule.resetPeriod !== 'none' && !rule.pattern.includes('{period}')
      ? rule.pattern.replace('{counter}', '{period}-{counter}')
      : rule.pattern;
  return pattern
    .replace('{prefix}', rule.prefix)
    .replace('{period}', periodKey)
    .replace('{suffix}', rule.suffix)
    .replace('{counter}', `${nextCounter}`.padStart(6, '0'));
}
