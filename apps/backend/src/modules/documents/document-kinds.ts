import { BadRequestException } from '@nestjs/common';

import type { TemplateType } from './documents.types.js';

/** К чему относится документ вида: один на группу, на курс группы, на слушателя… */
export type DocumentKindScope = 'group' | 'group_course' | 'learner' | 'learner_course' | 'course';

/**
 * Как нумеруется вид по умолчанию (паритет с CDOPROF, ТЗ §9.1; сами правила — МГ-F3.1):
 * `order_counter` — общий счётчик приказов центра; `group_code` — номер = код группы;
 * `protocol_suffix` — номер протокола + порядковый номер слушателя в группе;
 * `series_counter` — счётчик серий; `none` — без номера.
 */
export type DocumentKindNumbering =
  | 'order_counter'
  | 'group_code'
  | 'protocol_suffix'
  | 'series_counter'
  | 'none';

export interface DocumentKind {
  code: string;
  name: string;
  templateType: TemplateType;
  scope: DocumentKindScope;
  requiresCommission: boolean;
  requiresProtocol: boolean;
  numbering: DocumentKindNumbering;
}

/**
 * МГ-F1.1 (срез 18.1, РМ123): виды документов учебного центра — паритет с CDOPROF (ТЗ §9.1).
 *
 * Каталогом в коде, а не таблицей: в MVP центр не заводит своих видов, а четырнадцать
 * системных одинаковы для всех. «Вид» уточняет «тип движка» (`templateType`): у приказа пять
 * видов, у протокола два. Привязка шаблона, строка набора документов курса и выпущенный
 * документ помнят код вида — по нему пакет группы (МГ-F2.1) понимает, что уже выпущено.
 */
export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  {
    code: 'order.enrollment',
    name: 'Приказ о зачислении',
    templateType: 'order',
    scope: 'group',
    requiresCommission: false,
    requiresProtocol: false,
    numbering: 'order_counter'
  },
  {
    code: 'order.commission',
    name: 'Приказ об утверждении состава аттестационной комиссии',
    templateType: 'order',
    scope: 'group',
    requiresCommission: true,
    requiresProtocol: false,
    numbering: 'order_counter'
  },
  {
    code: 'order.admission',
    name: 'Приказ о допуске к итоговой аттестации',
    templateType: 'order',
    scope: 'group',
    requiresCommission: false,
    requiresProtocol: false,
    numbering: 'order_counter'
  },
  {
    code: 'order.workload',
    name: 'Приказ об установлении педагогической нагрузки',
    templateType: 'order',
    scope: 'group',
    requiresCommission: false,
    requiresProtocol: false,
    numbering: 'order_counter'
  },
  {
    code: 'order.completion',
    name: 'Приказ об окончании обучения',
    templateType: 'order',
    scope: 'group',
    requiresCommission: false,
    requiresProtocol: false,
    numbering: 'order_counter'
  },
  {
    code: 'protocol.knowledge_check',
    name: 'Протокол проверки знаний',
    templateType: 'protocol',
    scope: 'group_course',
    requiresCommission: true,
    requiresProtocol: false,
    numbering: 'group_code'
  },
  {
    code: 'protocol.dpp_qualification',
    name: 'Протокол с присвоением квалификации',
    templateType: 'protocol',
    scope: 'group_course',
    requiresCommission: true,
    requiresProtocol: false,
    numbering: 'group_code'
  },
  {
    code: 'protocol.extract',
    name: 'Выписка из протокола',
    templateType: 'reference',
    scope: 'learner',
    requiresCommission: false,
    requiresProtocol: true,
    numbering: 'protocol_suffix'
  },
  {
    code: 'certificate.ot',
    name: 'Удостоверение',
    templateType: 'certificate',
    scope: 'learner_course',
    requiresCommission: false,
    requiresProtocol: true,
    numbering: 'protocol_suffix'
  },
  {
    code: 'diploma.dpp',
    name: 'Диплом (свидетельство) ДПП',
    templateType: 'diploma',
    scope: 'learner',
    requiresCommission: false,
    requiresProtocol: true,
    numbering: 'series_counter'
  },
  {
    code: 'journal.group',
    name: 'Журнал учебной группы',
    templateType: 'report',
    scope: 'group',
    requiresCommission: false,
    requiresProtocol: false,
    numbering: 'none'
  },
  {
    code: 'sheet.learner',
    name: 'Лист учёта слушателя',
    templateType: 'report',
    scope: 'learner',
    requiresCommission: false,
    requiresProtocol: false,
    numbering: 'none'
  },
  {
    code: 'results.exam',
    name: 'Результаты экзаменов',
    templateType: 'report',
    scope: 'group',
    requiresCommission: false,
    requiresProtocol: false,
    numbering: 'none'
  },
  {
    code: 'tickets.print',
    name: 'Билеты и тесты для печати',
    templateType: 'report',
    scope: 'course',
    requiresCommission: false,
    requiresProtocol: false,
    numbering: 'none'
  }
];

export const documentKindOf = (code: string | undefined | null): DocumentKind | undefined =>
  code ? DOCUMENT_KINDS.find((kind) => kind.code === code) : undefined;

/**
 * Вид есть в каталоге и подходит шаблону по типу: удостоверение на бланке приказа выпустило бы
 * документ с чужой нумерацией и чужими переменными.
 */
/** Вид есть в справочнике — иначе понятный отказ `document_kind_unknown`. */
export function assertDocumentKindKnown(kindCode: string): DocumentKind {
  const kind = documentKindOf(kindCode);
  if (!kind) {
    throw new BadRequestException({
      code: 'document_kind_unknown',
      message: `Вида документа «${kindCode}» нет в справочнике видов.`
    });
  }
  return kind;
}

/**
 * МГ-F3.1 (срез 19.1): правило нумерации вида заводится с тем же типом документа, что у вида —
 * иначе счётчик «приказа о зачислении» мог бы нумеровать удостоверения.
 */
export function assertDocumentKindFitsType(kindCode: string, documentType: string): DocumentKind {
  const kind = documentKindOf(kindCode);
  if (!kind) {
    throw new BadRequestException({
      code: 'document_kind_unknown',
      message: `Вида документа «${kindCode}» нет в справочнике видов.`
    });
  }
  if (kind.templateType !== documentType) {
    throw new BadRequestException({
      code: 'document_kind_template_mismatch',
      message: `Вид «${kind.name}» не относится к выбранному типу документа.`
    });
  }
  return kind;
}

export function assertDocumentKindFitsTemplate(
  kindCode: string,
  templateType: string,
  templateName?: string
): DocumentKind {
  const kind = documentKindOf(kindCode);
  if (!kind) {
    throw new BadRequestException({
      code: 'document_kind_unknown',
      message: `Вида документа «${kindCode}» нет в справочнике видов.`
    });
  }
  if (kind.templateType !== templateType) {
    throw new BadRequestException({
      code: 'document_kind_template_mismatch',
      message: `Шаблон${templateName ? ` «${templateName}»` : ''} не подходит для вида «${kind.name}»: нужен шаблон другого типа.`
    });
  }
  return kind;
}
