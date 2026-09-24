/**
 * Колонки расширенного импорта слушателей (ТЗ перехода §6.4 МГ-C3.1; срез 10.1, РМ100–РМ102):
 * отчество отдельно или ФИО одной колонкой, дата рождения, пол, телефон, паспорт, гражданство,
 * образование, компания по ИНН. Чистые нормализаторы: человек пишет «ж», «01.03.1990»,
 * «Высшее — бакалавриат», сервер хранит `f`, `1990-03-01`, `higher_bachelor`.
 */
import { EDUCATION_LEVELS_SEED } from '../lookup/lookup.seed.js';

export type ImportGender = 'm' | 'f';

const MALE = new Set(['м', 'муж', 'мужской', 'мужчина', 'm', 'male']);
const FEMALE = new Set(['ж', 'жен', 'женский', 'женщина', 'f', 'female']);

/** Пол из любой привычной записи; `null` — не распознан, пустая строка — не указан. */
export const parseImportGender = (raw: string | undefined): ImportGender | '' | null => {
  const value = (raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!value) return '';
  if (MALE.has(value)) return 'm';
  if (FEMALE.has(value)) return 'f';
  return null;
};

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RU_RE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;

/** Дата в ISO из «ГГГГ-ММ-ДД» или «ДД.ММ.ГГГГ»; `null` — не дата. Excel отдаёт строки — числа не ждём. */
export const parseImportDate = (raw: string | undefined): string | '' | null => {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const iso = ISO_RE.exec(value);
  const ru = RU_RE.exec(value);
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : ru
      ? [Number(ru[3]), Number(ru[2]), Number(ru[1])]
      : [NaN, NaN, NaN];
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const fold = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^а-яёa-z0-9]+/g, ' ')
    .trim();

/** Уровень образования: код ФРДО как есть или русская подпись из справочника; `null` — не распознан. */
export const parseImportEducationLevel = (raw: string | undefined): string | '' | null => {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const byCode = EDUCATION_LEVELS_SEED.find((level) => level.code === value.toLowerCase());
  if (byCode) return byCode.code;
  const folded = fold(value);
  const byName = EDUCATION_LEVELS_SEED.find((level) => fold(level.name) === folded);
  return byName ? byName.code : null;
};

/** Подписи уровней для подсказки в ошибке — «Основное общее, Среднее общее, …». */
export const educationLevelNames = (): string =>
  EDUCATION_LEVELS_SEED.map((l) => l.name).join(', ');

/** ИНН компании: 10 (юрлицо) или 12 (ИП) цифр; `null` — не ИНН. */
export const parseImportInn = (raw: string | undefined): string | '' | null => {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 || digits.length === 12 ? digits : null;
};

/** Телефон: оставляем цифры и ведущий плюс; меньше 10 цифр — не телефон. */
export const parseImportPhone = (raw: string | undefined): string | '' | null => {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return `${value.startsWith('+') ? '+' : ''}${digits}`;
};

export interface ImportPassport {
  series: string;
  number: string;
  issuedAt?: string;
  issuedBy?: string;
}

/**
 * Паспорт из четырёх колонок: серия и номер — вместе или никак (как в карточке, Э8);
 * `null` — заполнено наполовину или дата выдачи не дата.
 */
export const parseImportPassport = (raw: {
  series?: string;
  number?: string;
  issuedAt?: string;
  issuedBy?: string;
}): ImportPassport | '' | null => {
  const series = (raw.series ?? '').trim();
  const number = (raw.number ?? '').trim();
  const issuedBy = (raw.issuedBy ?? '').trim();
  const issuedAt = parseImportDate(raw.issuedAt);
  if (!series && !number) {
    return issuedAt || issuedBy ? null : '';
  }
  if (!series || !number || issuedAt === null) return null;
  return {
    series,
    number,
    ...(issuedAt ? { issuedAt } : {}),
    ...(issuedBy ? { issuedBy } : {})
  };
};

/** ФИО одной строкой из отдельных колонок — если колонка «ФИО» пуста. */
export const composeFullName = (row: {
  fullName?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
}): string => {
  const whole = (row.fullName ?? '').trim();
  if (whole) return whole;
  return [row.lastName, row.firstName, row.middleName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
};
