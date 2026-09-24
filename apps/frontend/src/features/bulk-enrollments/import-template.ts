import * as XLSX from 'xlsx';

import { EDUCATION_LEVEL_LABEL } from '../lookup/labels';

import type { BulkOutcome } from '@trudskill/ui';

/**
 * Шаблон списка слушателей (ФТ-B1.2; расширен в МГ-C3.1, срез 10.2): четыре прежние колонки и
 * личное дело. Подсказки на листе «Как заполнять» — что писать, чтобы строка прошла проверку.
 */
export const TEMPLATE_COLUMNS = [
  {
    header: 'ФИО',
    hint: 'Фамилия Имя Отчество полностью, как в паспорте. Можно вместо этого заполнить три колонки: Фамилия, Имя слушателя, Отчество'
  },
  { header: 'Почта', hint: 'На неё придёт ссылка для входа. Без неё слушатель не сможет войти' },
  { header: 'СНИЛС', hint: '11 цифр. Можно с дефисами: 112-233-445 95' },
  { header: 'Должность', hint: 'Необязательно. Попадёт в документы об обучении' },
  { header: 'Дата рождения', hint: 'Необязательно. ДД.ММ.ГГГГ — нужна для выгрузки в ФИС ФРДО' },
  { header: 'Пол', hint: 'Необязательно. «м» или «ж»' },
  { header: 'Телефон', hint: 'Необязательно. Любая запись, не меньше 10 цифр' },
  { header: 'Серия паспорта', hint: 'Необязательно. Вместе с номером — или оставьте обе пустыми' },
  { header: 'Номер паспорта', hint: 'Необязательно. Вместе с серией' },
  { header: 'Дата выдачи', hint: 'Необязательно. ДД.ММ.ГГГГ' },
  { header: 'Кем выдан', hint: 'Необязательно. Как в паспорте' },
  { header: 'Гражданство', hint: 'Необязательно. Страна словами: Россия, Беларусь' },
  {
    header: 'Образование',
    hint: `Необязательно. Уровень как в ФРДО: ${Object.values(EDUCATION_LEVEL_LABEL).join(', ')}`
  },
  {
    header: 'ИНН компании',
    hint: 'Необязательно. 10 или 12 цифр компании из раздела «Компании»; незнакомый ИНН — слушатель заведётся без компании'
  }
] as const;

export const TEMPLATE_EXAMPLE = [
  'Иванов Иван Иванович',
  'ivanov@example.ru',
  '112-233-445 95',
  'Электромонтёр',
  '01.03.1990',
  'м',
  '+7 900 123-45-67',
  '45 12',
  '123456',
  '02.02.2015',
  'ОВД района',
  'Россия',
  'Среднее профессиональное',
  '7701234567'
] as const;

export const buildTemplateWorkbook = (): XLSX.WorkBook => {
  const book = XLSX.utils.book_new();

  const sheet = XLSX.utils.aoa_to_sheet([
    TEMPLATE_COLUMNS.map((column) => column.header),
    [...TEMPLATE_EXAMPLE]
  ]);
  XLSX.utils.book_append_sheet(book, sheet, 'Слушатели');

  const help = XLSX.utils.aoa_to_sheet([
    ['Колонка', 'Что писать'],
    ...TEMPLATE_COLUMNS.map((column) => [column.header, column.hint]),
    [],
    ['Строку-пример удалите перед загрузкой — иначе Иванов попадёт в группу.'],
    [
      'Порядок колонок неважен, заголовки можно писать по-своему: «Фамилия Имя Отчество», «e-mail», «Дата рожд.».'
    ],
    ['Обязательны только ФИО и Почта. Лишние колонки можно удалить.'],
    ['Строка с ошибкой пропускается, остальные загружаются — отказы будут показаны поимённо.']
  ]);
  XLSX.utils.book_append_sheet(book, help, 'Как заполнять');

  return book;
};

export const TEMPLATE_FILE_NAME = 'Шаблон списка слушателей.xlsx';

export const downloadTemplate = (): void => {
  XLSX.writeFile(buildTemplateWorkbook(), TEMPLATE_FILE_NAME);
};

export const ERROR_REPORT_HEADERS = ['Кто', 'Почему не загружен'] as const;

export const buildErrorReport = (outcome: BulkOutcome): string[][] =>
  outcome.failures.map((failure) => [failure.label, failure.reason]);

export const errorReportFileName = (today: string): string =>
  `Ошибки импорта ${today.slice(0, 10)}.csv`;
