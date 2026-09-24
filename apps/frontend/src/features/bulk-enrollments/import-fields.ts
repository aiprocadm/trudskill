import { EDUCATION_LEVEL_LABEL } from '../lookup/labels';

/**
 * Зеркало серверных нормализаторов колонок импорта (`apps/backend/src/modules/mvp/learner-import-fields.ts`,
 * МГ-C3.1, срез 10.2): проверка до отправки, чтобы человек увидел отказ в предпросмотре, а не
 * после загрузки. Дублирование осознанное — как у проверки СНИЛС в `validators.ts`.
 */
const MALE = new Set(['м', 'муж', 'мужской', 'мужчина', 'm', 'male']);
const FEMALE = new Set(['ж', 'жен', 'женский', 'женщина', 'f', 'female']);

export const parseImportGender = (raw: string | undefined): 'm' | 'f' | '' | null => {
  const value = (raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!value) return '';
  if (MALE.has(value)) return 'm';
  if (FEMALE.has(value)) return 'f';
  return null;
};

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RU_RE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;

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

export const parseImportEducationLevel = (raw: string | undefined): string | '' | null => {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (EDUCATION_LEVEL_LABEL[value.toLowerCase()]) return value.toLowerCase();
  const folded = fold(value);
  const match = Object.entries(EDUCATION_LEVEL_LABEL).find(([, name]) => fold(name) === folded);
  return match ? match[0] : null;
};

export const educationLevelNames = (): string => Object.values(EDUCATION_LEVEL_LABEL).join(', ');

export const parseImportInn = (raw: string | undefined): string | '' | null => {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 || digits.length === 12 ? digits : null;
};

export const parseImportPhone = (raw: string | undefined): string | '' | null => {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return `${value.startsWith('+') ? '+' : ''}${digits}`;
};

/** Паспорт: серия и номер вместе или никак; половина или кривая дата выдачи — `null`. */
export const passportProblem = (row: {
  passportSeries?: string;
  passportNumber?: string;
  passportIssuedAt?: string;
  passportIssuedBy?: string;
}): boolean => {
  const series = (row.passportSeries ?? '').trim();
  const number = (row.passportNumber ?? '').trim();
  const issuedBy = (row.passportIssuedBy ?? '').trim();
  const issuedAt = parseImportDate(row.passportIssuedAt);
  if (!series && !number) return Boolean(issuedAt || issuedBy);
  return !series || !number || issuedAt === null;
};

/** ФИО одной строкой из отдельных колонок — если колонка «ФИО» пуста (как на сервере). */
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

/** Сводка личного дела для предпросмотра — что заполнено, без сырых кодов. */
export const profileSummary = (row: {
  position?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  passportNumber?: string;
  citizenship?: string;
  educationLevel?: string;
  companyInn?: string;
}): string => {
  const parts = [
    row.position,
    row.dateOfBirth ? `род. ${row.dateOfBirth}` : '',
    row.gender ? `пол: ${row.gender}` : '',
    row.phone,
    row.passportNumber ? 'паспорт' : '',
    row.citizenship,
    row.educationLevel,
    row.companyInn ? `ИНН ${row.companyInn}` : ''
  ]
    .map((part) => (part ?? '').trim())
    .filter(Boolean);
  return parts.join(' · ');
};
