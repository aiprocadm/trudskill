/**
 * ФТ-A8 — мягкий комплаенс-валидатор протокола проверки знаний (Фаза 1 Task 10).
 *
 * Пункт 92 Правил обучения по охране труда (ПП РФ № 2464) перечисляет реквизиты,
 * которые протокол обязан содержать. Проверка **предупреждает, а не блокирует**:
 * бланк вправе нести реквизит текстом («Протокол № ___ от ___») или собственным
 * оформлением, и запрещать такой шаблон мы не можем. Смысл в другом — чтобы УЦ
 * узнал о пропущенном реквизите от нас, а не от инспектора при проверке.
 */

export interface ProtocolRequirement {
  /** Короткий машинный код — для UI и тестов. */
  code: string;
  /** Как реквизит называется в норме, человеческим языком. */
  title: string;
  /** Пункт нормы — админу нужно основание, а не «мы так решили». */
  basis: string;
  /** Плейсхолдеры каталога, любой из которых закрывает требование. */
  expected: readonly string[];
}

export const PROTOCOL_REQUIREMENTS: readonly ProtocolRequirement[] = [
  {
    code: 'organization',
    title: 'Наименование организации, проводившей проверку знаний',
    basis: 'п. 92 ПП 2464',
    expected: ['tenant.legal_name', 'tenant.name']
  },
  {
    code: 'protocol_number',
    title: 'Номер протокола',
    basis: 'п. 92 ПП 2464',
    expected: ['document.number']
  },
  {
    code: 'protocol_date',
    title: 'Дата протокола',
    basis: 'п. 92 ПП 2464',
    expected: ['document.issue_date', 'document.issue_date_words']
  },
  {
    code: 'program',
    title: 'Наименование программы обучения',
    basis: 'п. 92 ПП 2464',
    expected: ['course.title', 'program.regulatory_basis']
  },
  {
    code: 'learners',
    title: 'ФИО и должности проверяемых',
    basis: 'п. 92 ПП 2464',
    // Список слушателей идёт циклом: внутри доступны full_name и position.
    expected: ['group_learners', 'learner.full_name']
  },
  {
    code: 'assessment_result',
    title: 'Результат проверки знаний',
    basis: 'п. 92 ПП 2464',
    // Отдельной переменной «результат по слушателю» в каталоге пока нет —
    // засчитываем форму итоговой аттестации; итог по строкам таблицы УЦ
    // проставляет в бланке. Это ограничение отмечено в handoff.
    expected: ['program.final_assessment_form_label', 'program.final_assessment_form']
  },
  {
    code: 'commission',
    title: 'Состав комиссии и подписи',
    basis: 'п. 92 ПП 2464',
    expected: [
      'commission.members',
      'commission.chairman.name',
      'commission.secretary.name',
      'commission.name'
    ]
  }
];

export interface ProtocolComplianceResult {
  isCompliant: boolean;
  /** Требования, под которые в бланке не нашлось ни одного плейсхолдера. */
  missing: ProtocolRequirement[];
}

/**
 * Сверяет плейсхолдеры бланка с реквизитами п. 92. Неизвестные плейсхолдеры
 * игнорируются: их разбирает `classifyPlaceholders`, здесь они не мешают.
 */
export function validateProtocolTemplate(placeholders: string[]): ProtocolComplianceResult {
  const present = new Set(placeholders);
  const missing = PROTOCOL_REQUIREMENTS.filter(
    (requirement) => !requirement.expected.some((code) => present.has(code))
  );
  return { isCompliant: missing.length === 0, missing };
}
