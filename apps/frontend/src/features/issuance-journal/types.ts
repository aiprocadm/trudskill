/**
 * Pillar A Plan B §5.6 — типы для UI книги выдачи документов.
 *
 * Дублируем backend-union для UI-кода — фронт должен иметь свой source of truth,
 * чтобы можно было статически проверять русские лейблы в селектах. Если backend
 * добавит/удалит тип — frontend упадёт в compile, и мы это поймём при сборке.
 */
export type TemplateType =
  | 'certificate'
  | 'protocol'
  | 'order'
  | 'diploma'
  | 'attestation'
  | 'reference'
  | 'report'
  | 'contract';

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  certificate: 'Удостоверение',
  protocol: 'Протокол',
  order: 'Приказ',
  diploma: 'Диплом',
  attestation: 'Свидетельство об аттестации',
  reference: 'Справка',
  report: 'Отчёт',
  contract: 'Договор'
};

export const ALL_TEMPLATE_TYPES: TemplateType[] = [
  'certificate',
  'protocol',
  'order',
  'diploma',
  'attestation',
  'reference',
  'report',
  'contract'
];

export interface IssuedDocument {
  id: string;
  documentNumber?: string;
  documentType: TemplateType;
  status: string;
  documentDate?: string;
  groupOrderDocumentId?: string;
}

export interface IssuanceJournalFilter {
  from?: string;
  to?: string;
  types?: TemplateType[];
  status?: string;
  groupOrderDocumentId?: string;
  limit?: number;
  offset?: number;
}

export interface IssuanceJournalPage {
  items: IssuedDocument[];
  total: number;
}
