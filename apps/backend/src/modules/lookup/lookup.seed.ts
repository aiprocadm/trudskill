import type { CodeNameRow } from './lookup.repository.js';

/**
 * Сиды глобальных справочников — те же строки, что в миграции 0113. В памяти (тесты, стенд
 * без базы) читаются отсюда; Postgres читает таблицы, куда их положила миграция.
 */
export const EDUCATION_LEVELS_SEED: ReadonlyArray<CodeNameRow> = [
  { code: 'basic_general', name: 'Основное общее', sortOrder: 10, isActive: true },
  { code: 'secondary_general', name: 'Среднее общее', sortOrder: 20, isActive: true },
  { code: 'secondary_vocational', name: 'Среднее профессиональное', sortOrder: 30, isActive: true },
  { code: 'higher_bachelor', name: 'Высшее — бакалавриат', sortOrder: 40, isActive: true },
  {
    code: 'higher_specialist',
    name: 'Высшее — специалитет, магистратура',
    sortOrder: 50,
    isActive: true
  },
  {
    code: 'higher_postgraduate',
    name: 'Высшее — подготовка кадров высшей квалификации',
    sortOrder: 60,
    isActive: true
  },
  { code: 'other', name: 'Иное', sortOrder: 90, isActive: true }
];

/** ISO 3166-1 alpha-2 (РМ82): Россия и ЕАЭС/СНГ первыми, далее частые в ДПО; пополняется миграцией. */
export const COUNTRIES_SEED: ReadonlyArray<CodeNameRow> = [
  ['RU', 'Россия', 1],
  ['BY', 'Беларусь', 2],
  ['KZ', 'Казахстан', 3],
  ['KG', 'Киргизия', 4],
  ['AM', 'Армения', 5],
  ['UZ', 'Узбекистан', 6],
  ['TJ', 'Таджикистан', 7],
  ['TM', 'Туркменистан', 8],
  ['AZ', 'Азербайджан', 9],
  ['MD', 'Молдова', 10],
  ['GE', 'Грузия', 11],
  ['UA', 'Украина', 12],
  ['CN', 'Китай', 20],
  ['VN', 'Вьетнам', 21],
  ['IN', 'Индия', 22],
  ['TR', 'Турция', 23],
  ['MN', 'Монголия', 24],
  ['RS', 'Сербия', 25],
  ['DE', 'Германия', 26],
  ['IL', 'Израиль', 27],
  ['EG', 'Египет', 28],
  ['IR', 'Иран', 29],
  ['SY', 'Сирия', 30],
  ['KP', 'КНДР', 31]
].map(([code, name, sortOrder]) => ({
  code: code as string,
  name: name as string,
  sortOrder: sortOrder as number,
  isActive: true
}));
