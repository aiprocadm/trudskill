import type {
  ClientEditFormState,
  ClientListItem,
  ClientRequisiteKey,
  ClientStatus,
  CreateClientPayload,
  InnSuggestion,
  UpdateClientPayload
} from './types';

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Активна',
  archived: 'В архиве'
};

/** Все реквизиты МГ-D1.1 — порядок полей в форме и на карточке. */
export const CLIENT_REQUISITE_KEYS: readonly ClientRequisiteKey[] = [
  'shortName',
  'ogrn',
  'okpo',
  'okato',
  'oktmo',
  'okogu',
  'okopf',
  'okved',
  'postalAddress',
  'actualAddress',
  'region',
  'city',
  'postalCode',
  'fax',
  'directorName',
  'directorPosition',
  'contractNumber',
  'contractDate',
  'managerUserId'
];

export interface RequisiteFieldMeta {
  key: Exclude<ClientRequisiteKey, 'managerUserId'>;
  label: string;
  hint?: string;
  numeric?: boolean;
  date?: boolean;
}

/**
 * Разделы формы контрагента (МГ-D1.1): в CDOPROF реквизиты и связь были «одной простынёй»
 * (слабое место I.1.4) — здесь они разложены по смыслу. Ответственный за компанию выбирается отдельно, из
 * списка сотрудников.
 */
export const CLIENT_REQUISITE_SECTIONS: ReadonlyArray<{
  title: string;
  fields: readonly RequisiteFieldMeta[];
}> = [
  {
    title: 'Реквизиты',
    fields: [
      {
        key: 'shortName',
        label: 'Краткое название',
        hint: 'Как в выписке ЕГРЮЛ, например ООО «Ромашка»'
      },
      { key: 'ogrn', label: 'ОГРН', hint: '13 цифр, у предпринимателя — 15', numeric: true },
      { key: 'okpo', label: 'ОКПО', hint: '8 или 10 цифр', numeric: true },
      { key: 'okato', label: 'ОКАТО', numeric: true },
      { key: 'oktmo', label: 'ОКТМО', hint: '8 или 11 цифр', numeric: true },
      { key: 'okogu', label: 'ОКОГУ', hint: '7 цифр', numeric: true },
      { key: 'okopf', label: 'ОКОПФ', hint: '5 цифр', numeric: true },
      { key: 'okved', label: 'ОКВЭД', hint: 'Например, 85.42' }
    ]
  },
  {
    title: 'Адреса и связь',
    fields: [
      { key: 'postalAddress', label: 'Почтовый адрес' },
      { key: 'actualAddress', label: 'Фактический адрес' },
      { key: 'region', label: 'Регион' },
      { key: 'city', label: 'Город' },
      { key: 'postalCode', label: 'Индекс', hint: '6 цифр', numeric: true },
      { key: 'fax', label: 'Факс' }
    ]
  },
  {
    title: 'Руководитель',
    fields: [
      { key: 'directorName', label: 'ФИО руководителя' },
      { key: 'directorPosition', label: 'Должность руководителя' }
    ]
  },
  {
    title: 'Договор',
    fields: [
      { key: 'contractNumber', label: 'Номер договора' },
      { key: 'contractDate', label: 'Дата договора', date: true }
    ]
  }
];

/** Отображение ИНН без разделителей; «—» если пусто или невалидно. */
export function formatInn(inn: string | undefined): string {
  if (!inn) return '—';
  const digits = inn.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 12) return digits;
  return inn;
}

/** ИНН годится для подстановки: 10 цифр у организации, 12 у предпринимателя. */
export function isInnForSuggest(inn: string): boolean {
  return /^(\d{10}|\d{12})$/.test(inn.replace(/\s+/g, ''));
}

/** Телефон: нормализует +7-формат если 11 цифр; иначе оставляет как введено или «—». */
export function formatPhone(phone: string | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return phone;
}

/** `2026-03-01` → `01.03.2026`; другое — как есть. Без часовых поясов: это календарная дата. */
export function formatContractDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

/** 0..1 → «X из Y (Z%)». При total=0 — «0 из 0». */
export function formatProgressLabel(completed: number, total: number): string {
  if (total === 0) return '0 из 0';
  const percent = Math.round((completed / total) * 100);
  return `${completed} из ${total} (${percent}%)`;
}

/** Edit form → PATCH payload (null для очистки опциональных полей). */
export function buildClientUpdatePayload(form: ClientEditFormState): UpdateClientPayload {
  const nullable = (v: string): string | null => (v.trim() ? v.trim() : null);
  const required = (v: string): string => v.trim();
  const payload: UpdateClientPayload = {
    code: required(form.code),
    name: required(form.name),
    legalName: nullable(form.legalName),
    inn: nullable(form.inn),
    kpp: nullable(form.kpp),
    contactEmail: nullable(form.contactEmail),
    contactPhone: nullable(form.contactPhone),
    legalAddress: nullable(form.legalAddress),
    note: nullable(form.note),
    status: form.status
  };
  for (const key of CLIENT_REQUISITE_KEYS) payload[key] = nullable(form[key]);
  return payload;
}

/** Edit form → POST payload (опциональные поля пропускаются если пусто). */
export function buildClientCreatePayload(form: ClientEditFormState): CreateClientPayload {
  const payload: CreateClientPayload = {
    code: form.code.trim(),
    name: form.name.trim(),
    ...(form.legalName.trim() ? { legalName: form.legalName.trim() } : {}),
    ...(form.inn.trim() ? { inn: form.inn.trim() } : {}),
    ...(form.kpp.trim() ? { kpp: form.kpp.trim() } : {}),
    ...(form.contactEmail.trim() ? { contactEmail: form.contactEmail.trim() } : {}),
    ...(form.contactPhone.trim() ? { contactPhone: form.contactPhone.trim() } : {}),
    ...(form.legalAddress.trim() ? { legalAddress: form.legalAddress.trim() } : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {})
  };
  for (const key of CLIENT_REQUISITE_KEYS) {
    const value = form[key].trim();
    if (value) payload[key] = value;
  }
  return payload;
}

const emptyRequisites = (): Record<ClientRequisiteKey, string> =>
  Object.fromEntries(CLIENT_REQUISITE_KEYS.map((key) => [key, ''])) as Record<
    ClientRequisiteKey,
    string
  >;

export function emptyClientForm(): ClientEditFormState {
  return {
    ...emptyRequisites(),
    code: '',
    name: '',
    legalName: '',
    inn: '',
    kpp: '',
    contactEmail: '',
    contactPhone: '',
    legalAddress: '',
    note: '',
    status: 'active'
  };
}

export function toEditFormState(client: ClientListItem): ClientEditFormState {
  const requisites = emptyRequisites();
  for (const key of CLIENT_REQUISITE_KEYS) requisites[key] = client[key] ?? '';
  return {
    ...requisites,
    code: client.code,
    name: client.name,
    legalName: client.legalName ?? '',
    inn: client.inn ?? '',
    kpp: client.kpp ?? '',
    contactEmail: client.contactEmail ?? '',
    contactPhone: client.contactPhone ?? '',
    legalAddress: client.legalAddress ?? '',
    note: client.note ?? '',
    status: client.status
  };
}

/** Поля формы, которые умеет заполнить подсказка по ИНН. */
type SuggestibleField = Exclude<keyof ClientEditFormState, 'status'>;

/**
 * «Заполнить по ИНН» (МГ-D1.2): подсказка кладётся только в ПУСТЫЕ поля — введённое руками
 * не затирается, даже если справочник знает другое (куратор мог сверить договор). Название
 * для списка — краткое наименование, юридическое — полное с формой собственности.
 */
export function applyInnSuggestion(
  form: ClientEditFormState,
  suggestion: InnSuggestion
): { form: ClientEditFormState; filled: number } {
  const offered: Partial<Record<SuggestibleField, string | undefined>> = {
    name: suggestion.shortName ?? suggestion.name,
    legalName: suggestion.name,
    kpp: suggestion.kpp,
    legalAddress: suggestion.legalAddress,
    shortName: suggestion.shortName,
    ogrn: suggestion.ogrn,
    okpo: suggestion.okpo,
    okato: suggestion.okato,
    oktmo: suggestion.oktmo,
    okogu: suggestion.okogu,
    okopf: suggestion.okopf,
    okved: suggestion.okved,
    postalCode: suggestion.postalCode,
    city: suggestion.city,
    region: suggestion.region,
    directorName: suggestion.directorName,
    directorPosition: suggestion.directorPosition
  };
  const next: ClientEditFormState = { ...form };
  let filled = 0;
  for (const [key, value] of Object.entries(offered) as Array<
    [SuggestibleField, string | undefined]
  >) {
    if (!value || next[key].trim()) continue;
    next[key] = value;
    filled += 1;
  }
  return { form: next, filled };
}

/** Реквизиты для карточки: только заполненные, словами. Ответственный — по имени. */
export function clientRequisiteRows(
  client: ClientListItem
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const section of CLIENT_REQUISITE_SECTIONS) {
    for (const field of section.fields) {
      const value = client[field.key];
      if (!value) continue;
      rows.push({ label: field.label, value: field.date ? formatContractDate(value) : value });
    }
  }
  if (client.managerUserId) {
    rows.push({
      label: 'Ответственный за компанию',
      value: client.managerName ?? 'сотрудник больше не работает в центре'
    });
  }
  return rows;
}
