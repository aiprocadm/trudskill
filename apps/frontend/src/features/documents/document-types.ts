/**
 * Виды документов — общий справочник.
 *
 * Список жил в книге выдачи (`features/issuance-journal/types.ts`), а экран шаблонов держал
 * свою копию прямо в разметке — восемь `<option>` подряд. Копии разъезжаются: в книге выдачи
 * «Свидетельство об аттестации», в шаблонах могло оказаться другое слово. Теперь список один,
 * а книга выдачи берёт его отсюда.
 *
 * Состав фиксирован: Pillar A Plan B §5.4 — семь регулируемых видов плюс договор,
 * оставшийся с прежних времён.
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

export const templateTypeLabel = (type: string | undefined): string =>
  TEMPLATE_TYPE_LABELS[(type ?? '') as TemplateType] ?? (type || '—');
