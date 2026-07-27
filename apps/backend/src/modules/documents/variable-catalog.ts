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
  /**
   * Картинка (ФТ-A7.1): в бланк ставится тегом `{%tenant.stamp_image}`, а значением
   * переменной остаётся fileId — по нему рендер забирает сам файл. Обычный тег без `%`
   * напечатал бы идентификатор файла текстом, поэтому админ-UX об этом предупреждает.
   */
  kind?: 'image';
}

const entry = (
  category: VariableCategoryCode,
  key: string,
  description: string
): VariableCatalogEntry => ({ code: `${category}.${key}`, category, description });

const imageEntry = (
  category: VariableCategoryCode,
  key: string,
  description: string
): VariableCatalogEntry => ({ code: `${category}.${key}`, category, description, kind: 'image' });

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
  imageEntry('tenant', 'signature_image', 'Подпись руководителя — тег {%tenant.signature_image}'),
  imageEntry('tenant', 'stamp_image', 'Печать учебного центра — тег {%tenant.stamp_image}'),

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
  imageEntry(
    'commission',
    'chairman.signature_file_id',
    'Председатель — подпись; тег {%commission.chairman.signature_file_id}'
  ),
  entry('commission', 'secretary.name', 'Секретарь комиссии — ФИО'),
  entry('commission', 'secretary.position', 'Секретарь комиссии — должность'),
  imageEntry(
    'commission',
    'secretary.signature_file_id',
    'Секретарь — подпись; тег {%commission.secretary.signature_file_id}'
  ),
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

const IMAGE_CODES: ReadonlySet<string> = new Set(
  VARIABLE_CATALOG.filter((item) => item.kind === 'image').map((item) => item.code)
);

/**
 * Переменная-картинка (ФТ-A7.1)? Её значение — fileId, а не текст: конвейер рендера
 * подменяет его на сам файл, а админ-UX подсказывает синтаксис `{%…}`.
 */
export function isImageVariable(code: string): boolean {
  return IMAGE_CODES.has(code);
}

/** Коды всех переменных-картинок — вход для сборщика картинок при рендере. */
export function imageVariableCodes(): string[] {
  return [...IMAGE_CODES];
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

/**
 * Демо-значения для предпросмотра бланка (ФТ-A3.3): админ жмёт «Сгенерировать пример» и
 * видит документ, заполненный образцовыми данными, — без реальной группы и без выдачи
 * настоящего номера. Значения намеренно узнаваемо-условные, чтобы никто не принял
 * предпросмотр за подлинный документ.
 */
export function demoVariables(): Record<string, unknown> {
  const values: Record<string, unknown> = {
    'tenant.name': 'АНО ДПО «Учебный центр» (пример)',
    'tenant.code': 'DEMO',
    'tenant.legal_name': 'Автономная некоммерческая организация ДПО «Учебный центр»',
    'tenant.tax_number': '7700000000',
    'tenant.license_number': 'Л000-00000-00/00000000',
    'tenant.license_issuer': 'Рособрнадзор',
    'tenant.license_issued_at': '2024-01-15',
    'tenant.license_issued_at_words': '15 января 2024 г.',
    'tenant.accreditation_number': 'АКК-000000',
    'tenant.accreditation_issuer': 'Минтруд России',
    // Картинки в предпросмотр подставляются отдельно (реальные подпись и печать центра,
    // если загружены) — здесь только заглушки, чтобы словарь совпадал с каталогом.
    'tenant.signature_image': '',
    'tenant.stamp_image': '',

    'learner.full_name': 'Образцов Образец Образцович',
    'learner.last_name': 'Образцов',
    'learner.first_name': 'Образец',
    'learner.middle_name': 'Образцович',
    'learner.initials': 'Образцов О. О.',
    'learner.snils': '000-000-000 00',
    'learner.position': 'Специалист',
    'learner.birth_date': '1990-01-01',
    'learner.birth_date_words': '1 января 1990 г.',
    'learner.email': 'sample@example.org',
    'learner.learner_no': 'L-000001',

    'counterparty.name': 'ООО «Образец»',
    'counterparty.legal_name': 'Общество с ограниченной ответственностью «Образец»',
    'counterparty.code': 'CP-000',
    'counterparty.inn': '7700000001',
    'counterparty.kpp': '770001001',
    'counterparty.legal_address': 'г. Москва, ул. Примерная, д. 1',
    'counterparty.contact_email': 'info@example.org',
    'counterparty.contact_phone': '+7 (000) 000-00-00',

    'group.code': 'G-000',
    'group.name': 'Группа-образец',
    'group.counterparty_name': 'ООО «Образец»',

    'course.code': 'DEMO-40',
    'course.title': 'Программа-образец, 40 часов',
    'course.description': 'Демонстрационная программа для предпросмотра бланка',

    'program.academic_hours': 40,
    'program.training_type': 'primary',
    'program.training_type_label': 'Первичное обучение',
    'program.learner_category': 'manager',
    'program.learner_category_label': 'Руководители',
    'program.study_form': 'distance',
    'program.study_form_label': 'Дистанционная',
    'program.final_assessment_form': 'test',
    'program.final_assessment_form_label': 'Тестирование',
    'program.regulatory_basis': 'ПП 2464',
    'program.commission_name': 'Комиссия-образец',
    'program.commission_code': 'K-000',

    'commission.code': 'K-000',
    'commission.name': 'Комиссия-образец',
    'commission.description': 'Комиссия по проверке знаний (пример)',
    'commission.chairman.name': 'Председателев Пётр Петрович',
    'commission.chairman.position': 'Директор',
    'commission.chairman.signature_file_id': '',
    'commission.secretary.name': 'Секретарёва Светлана Сергеевна',
    'commission.secretary.position': 'Секретарь',
    'commission.secretary.signature_file_id': '',
    'commission.members': [
      { fullName: 'Председателев Пётр Петрович', position: 'Директор', role: 'chairman' },
      { fullName: 'Членов Максим Михайлович', position: 'Главный инженер', role: 'member' }
    ],

    'enrollment.id': 'enrollment-sample',
    'enrollment.status': 'completed',
    'enrollment.start_date': '2026-01-10',
    'enrollment.end_date': '2026-02-10',
    'enrollment.completion_date': '2026-02-08',

    'document.id': 'document-sample',
    'document.number': 'ОБРАЗЕЦ-0001',
    'document.issue_date': '2026-02-08',
    'document.issue_date_words': '8 февраля 2026 г.',
    'document.type': 'certificate',
    'document.qr_url': 'https://example.org/verify/sample',

    group_learners: [
      {
        row_no: 1,
        fullName: 'Образцов Образец Образцович',
        full_name: 'Образцов Образец Образцович',
        snils: '000-000-000 00',
        position: 'Специалист',
        enrolledAt: '2026-01-10',
        enrolled_at: '2026-01-10',
        status: 'completed',
        learnerNo: 'L-000001',
        learner_no: 'L-000001'
      },
      {
        row_no: 2,
        fullName: 'Примерова Прима Примовна',
        full_name: 'Примерова Прима Примовна',
        snils: '000-000-000 01',
        position: 'Инженер',
        enrolledAt: '2026-01-10',
        enrolled_at: '2026-01-10',
        status: 'completed',
        learnerNo: 'L-000002',
        learner_no: 'L-000002'
      }
    ],
    group_learners_count: 2
  };
  // Гарантия полноты: любая переменная каталога, забытая выше, всё равно попадёт в предпросмотр.
  for (const code of allVariableCodes()) {
    if (!(code in values)) values[code] = `«${code}»`;
  }
  return values;
}
