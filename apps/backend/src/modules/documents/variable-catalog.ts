import type { VariableCategoryCode } from './documents.types.js';

/**
 * Каталог переменных шаблонов (ФТ-A2.1/A2.3) — единый источник правды о том,
 * какие плейсхолдеры вообще существуют.
 *
 * Почему в коде, а не сидами в БД (отступление от плана Task 4): таблица
 * `documents.template_variables` привязана к КОНКРЕТНОЙ версии шаблона
 * (`template_version_id`), т.е. это «переменные, объявленные в этом бланке», а не
 * глобальный справочник. Сеять в неё общий список — плодить копии на каждую версию,
 * причём схема таблицы расходится между миграциями 0002 и 0005. Каталог в коде живёт
 * рядом с резолверами, которые его и реализуют: добавил переменную — обязан добавить
 * ветку в resolver, иначе тест синхронизации падает.
 *
 * Используется: (1) сборщиком словаря при рендере, (2) админ-UX «найдено /
 * соответствует каталогу / неизвестно» при загрузке DOCX (ФТ-A3.2, Task 5).
 */

export interface VariableCatalogEntry {
  /** Полный плейсхолдер без скобок, как пишут в бланке: `learner.full_name`. */
  code: string;
  category: VariableCategoryCode;
  /** Человекочитаемое описание для админского UI. */
  description: string;
}

const entry = (
  category: VariableCategoryCode,
  key: string,
  description: string
): VariableCatalogEntry => ({ code: `${category}.${key}`, category, description });

export const VARIABLE_CATALOG: readonly VariableCatalogEntry[] = [
  // --- Учебный центр ---
  entry('tenant', 'name', 'Название учебного центра'),
  entry('tenant', 'code', 'Код учебного центра'),
  entry('tenant', 'legal_name', 'Полное юридическое наименование'),
  entry('tenant', 'tax_number', 'ИНН учебного центра'),
  entry('tenant', 'license_number', 'Номер действующей образовательной лицензии'),
  entry('tenant', 'license_issuer', 'Кем выдана лицензия'),
  entry('tenant', 'license_issued_at', 'Дата выдачи лицензии (ГГГГ-ММ-ДД)'),
  entry('tenant', 'license_issued_at_words', 'Дата выдачи лицензии прописью'),
  entry('tenant', 'accreditation_number', 'Номер действующей аккредитации'),
  entry('tenant', 'accreditation_issuer', 'Кем выдана аккредитация'),

  // --- Слушатель ---
  entry('learner', 'full_name', 'ФИО слушателя полностью'),
  entry('learner', 'last_name', 'Фамилия'),
  entry('learner', 'first_name', 'Имя'),
  entry('learner', 'middle_name', 'Отчество'),
  entry('learner', 'initials', 'Фамилия и инициалы («Иванов И. И.»)'),
  entry('learner', 'snils', 'СНИЛС слушателя'),
  entry('learner', 'position', 'Должность слушателя'),
  entry('learner', 'birth_date', 'Дата рождения (ГГГГ-ММ-ДД)'),
  entry('learner', 'birth_date_words', 'Дата рождения прописью'),
  entry('learner', 'email', 'E-mail слушателя'),
  entry('learner', 'learner_no', 'Личный номер слушателя'),

  // --- Заказчик обучения ---
  entry('counterparty', 'name', 'Название организации-заказчика'),
  entry('counterparty', 'legal_name', 'Юридическое наименование заказчика'),
  entry('counterparty', 'code', 'Код заказчика'),
  entry('counterparty', 'inn', 'ИНН заказчика'),
  entry('counterparty', 'kpp', 'КПП заказчика'),
  entry('counterparty', 'legal_address', 'Юридический адрес заказчика'),
  entry('counterparty', 'contact_email', 'Контактный e-mail заказчика'),
  entry('counterparty', 'contact_phone', 'Контактный телефон заказчика'),

  // --- Группа ---
  entry('group', 'code', 'Код учебной группы'),
  entry('group', 'name', 'Название учебной группы'),
  entry('group', 'counterparty_name', 'Заказчик группы'),

  // --- Курс ---
  entry('course', 'code', 'Код программы'),
  entry('course', 'title', 'Название программы'),
  entry('course', 'description', 'Описание программы'),

  // --- Программа обучения (метаданные версии курса) ---
  entry('program', 'academic_hours', 'Объём программы в академических часах'),
  entry('program', 'training_type', 'Вид обучения (код)'),
  entry('program', 'training_type_label', 'Вид обучения (текстом)'),
  entry('program', 'learner_category', 'Категория слушателей (код)'),
  entry('program', 'learner_category_label', 'Категория слушателей (текстом)'),
  entry('program', 'study_form', 'Форма обучения (код)'),
  entry('program', 'study_form_label', 'Форма обучения (текстом)'),
  entry('program', 'final_assessment_form', 'Форма итоговой аттестации (код)'),
  entry('program', 'final_assessment_form_label', 'Форма итоговой аттестации (текстом)'),
  entry('program', 'regulatory_basis', 'Нормативное основание программы'),
  entry('program', 'commission_name', 'Комиссия программы — название'),
  entry('program', 'commission_code', 'Комиссия программы — код'),

  // --- Комиссия ---
  entry('commission', 'code', 'Код комиссии'),
  entry('commission', 'name', 'Название комиссии'),
  entry('commission', 'description', 'Описание комиссии'),
  entry('commission', 'chairman.name', 'Председатель комиссии — ФИО'),
  entry('commission', 'chairman.position', 'Председатель комиссии — должность'),
  entry('commission', 'chairman.signature_file_id', 'Председатель — файл подписи'),
  entry('commission', 'secretary.name', 'Секретарь комиссии — ФИО'),
  entry('commission', 'secretary.position', 'Секретарь комиссии — должность'),
  entry('commission', 'secretary.signature_file_id', 'Секретарь — файл подписи'),
  entry('commission', 'members', 'Состав комиссии (список для цикла)'),

  // --- Запись на обучение ---
  entry('enrollment', 'id', 'Идентификатор записи на обучение'),
  entry('enrollment', 'status', 'Статус обучения'),
  entry('enrollment', 'start_date', 'Дата начала обучения'),
  entry('enrollment', 'end_date', 'Плановая дата окончания'),
  entry('enrollment', 'completion_date', 'Фактическая дата завершения'),

  // --- Документ ---
  entry('document', 'id', 'Идентификатор документа'),
  entry('document', 'number', 'Номер документа'),
  entry('document', 'issue_date', 'Дата выдачи (ГГГГ-ММ-ДД)'),
  entry('document', 'issue_date_words', 'Дата выдачи прописью'),
  entry('document', 'type', 'Тип документа'),
  entry('document', 'qr_url', 'Ссылка публичной проверки (для QR)'),

  // --- Список слушателей группы (для таблицы протокола) ---
  {
    code: 'group_learners',
    category: 'group_learners',
    description:
      'Список слушателей группы для цикла {#group_learners}…{/group_learners}; внутри доступны {row_no}, {full_name}, {snils}, {position}, {enrolled_at}, {learner_no}'
  },
  {
    code: 'group_learners_count',
    category: 'group_learners',
    description: 'Количество слушателей в списке'
  }
];

const CATALOG_CODES: ReadonlySet<string> = new Set(VARIABLE_CATALOG.map((item) => item.code));

export function isKnownVariable(code: string): boolean {
  return CATALOG_CODES.has(code);
}

/** Все коды каталога — вход для сборщика словаря при рендере. */
export function allVariableCodes(): string[] {
  return VARIABLE_CATALOG.map((item) => item.code);
}

/**
 * Раскладка найденных в бланке плейсхолдеров на «известные / неизвестные» —
 * основа таблицы админ-UX при загрузке DOCX (ФТ-A3.2).
 */
export function classifyPlaceholders(placeholders: string[]): {
  known: VariableCatalogEntry[];
  unknown: string[];
} {
  const known: VariableCatalogEntry[] = [];
  const unknown: string[] = [];
  for (const name of placeholders) {
    const found = VARIABLE_CATALOG.find((item) => item.code === name);
    if (found) known.push(found);
    else unknown.push(name);
  }
  return { known, unknown };
}
