import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Настройка нумераторов документов (ФТ-A4.1, Фаза 1 Task 6; МГ-F3.1 — нумерация CDOPROF).
 *
 * Маска, стартовое значение и период сброса задаются per tenant per тип документа, а с
 * МГ-F3.1 — ещё и per вид документа («приказ о зачислении» отдельно от «приказа об
 * окончании»). Раньше правило можно было создать только через API — админ УЦ, переносящий
 * журнал с бумаги, не мог ни продолжить нумерацию с нужного номера, ни увидеть текущую.
 */

/** Период обнуления счётчика: сквозная нумерация / с нового года / с нового месяца. */
export type NumberResetPeriod = 'none' | 'year' | 'month';

/** Часть номера CDOPROF: начальное значение и «растёт ли сама» с каждым выпуском. */
export interface NumberPart {
  start: number;
  auto: boolean;
}

export interface NumberingRuleDto {
  id: string;
  documentType: string;
  /** МГ-F3.1: правило конкретного вида документа; пусто — правило типа целиком. */
  kindCode?: string;
  prefix: string;
  suffix: string;
  pattern: string;
  series?: string;
  parts?: NumberPart[];
  currentCounter: number;
  resetPeriod: NumberResetPeriod;
  isActive: boolean;
  updatedAt: string;
}

export interface CreateNumberingRuleInput {
  documentType: string;
  kindCode?: string;
  prefix?: string;
  suffix?: string;
  pattern?: string;
  series?: string;
  parts?: NumberPart[];
  resetPeriod?: NumberResetPeriod;
  /** Номер, который выдастся первым (не «последний выданный»). */
  startCounter?: number;
}

export type UpdateNumberingRuleInput = Omit<CreateNumberingRuleInput, 'documentType' | 'kindCode'>;

/** Ответ сервера «следующий номер будет …»: номер или то, чего для него не хватает. */
export interface NumberPreview {
  next: string | null;
  missing: string[];
  ruleId?: string;
}

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
    }),

  /**
   * МГ-F3.1 (срез 19.3): следующий номер считает СЕРВЕР — тем же кодом, что выпуск, в поясе
   * центра. Клиентская формула ниже считала период по UTC и в ночь на 1 января показывала
   * прошлый год (журнал 658).
   */
  preview: (
    session: UserSession,
    query: { documentType?: string; kindCode?: string; groupId?: string }
  ) => {
    const qs = new URLSearchParams();
    if (query.documentType) qs.set('documentType', query.documentType);
    if (query.kindCode) qs.set('kindCode', query.kindCode);
    if (query.groupId) qs.set('groupId', query.groupId);
    return apiRequest<NumberPreview>(`/numbering-rules/preview?${qs.toString()}`, {
      auth: auth(session)
    });
  },

  /** МГ-F3.1: сброс счётчика — подтверждение числом уже выданных номеров (только администратор). */
  reset: (
    session: UserSession,
    id: string,
    input: { confirmation: string; startCounter: number }
  ) =>
    apiRequest<NumberingRuleDto>(`/numbering-rules/${id}/reset`, {
      method: 'POST',
      body: input,
      auth: auth(session)
    })
};

/**
 * Пример для предпросмотра маски с данными группы: сервер знает настоящую группу только при
 * выпуске, а форма показывает, как номер будет выглядеть, — на условной группе 264501.
 */
export const SAMPLE_FACTS = { groupCode: '264501', protocolNumber: '264501', seqGroup: 1 };

/** Токены, которым нужны данные группы: для них предпросмотр — пример, а не точный номер. */
export const FACT_TOKENS = ['{group.code}', '{protocol.number}', '{seq.group}'] as const;

export const usesGroupFacts = (pattern: string): boolean =>
  FACT_TOKENS.some((token) => pattern.includes(token));

/**
 * Предпросмотр маски без обращения к серверу: админ должен видеть, что получится,
 * до сохранения правила. Повторяет серверную сборку номера (`numbering-format.ts`):
 * счётчик — 6 знаков с ведущими нулями, `{seq.year}` — без нулей, части номера через дефис,
 * данные группы — из примера `SAMPLE_FACTS`.
 */
export function previewNumber(
  rule: Pick<NumberingRuleDto, 'prefix' | 'suffix' | 'pattern' | 'resetPeriod'> &
    Partial<Pick<NumberingRuleDto, 'series' | 'parts'>>,
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
  const running = ['{counter}', '{seq.year}', '{parts}'].find((t) => rule.pattern.includes(t));
  const pattern =
    rule.resetPeriod !== 'none' && !rule.pattern.includes('{period}') && running
      ? rule.pattern.replace(running, `{period}-${running}`)
      : rule.pattern;
  const parts = rule.parts?.length
    ? rule.parts.map((p) => `${p.auto ? p.start + nextCounter - 1 : p.start}`).join('-')
    : `${nextCounter}`;
  const values: Record<string, string> = {
    '{prefix}': rule.prefix,
    '{suffix}': rule.suffix,
    '{period}': periodKey,
    '{counter}': `${nextCounter}`.padStart(6, '0'),
    '{seq.year}': `${nextCounter}`,
    '{series}': rule.series ?? '',
    '{parts}': parts,
    '{group.code}': SAMPLE_FACTS.groupCode,
    '{protocol.number}': SAMPLE_FACTS.protocolNumber,
    '{seq.group}': `${SAMPLE_FACTS.seqGroup}`
  };
  return Object.entries(values).reduce(
    (acc, [token, value]) => acc.split(token).join(value),
    pattern
  );
}
