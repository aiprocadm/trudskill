/**
 * Запись CDOPROF → черновик записи центра (МГ-K3.1, срез 23.1).
 *
 * Здесь только разбор и проверки, без сопоставления: что взять из полей источника, что
 * отбросить с замечанием и что делает строку непереносимой. Грязь источника известна (ТЗ
 * I.1.3, I.2 P8): дата рождения `2109-12-01`, должность «undefined», слушатель только с
 * `full_name`, пустой или 12-значный ИНН.
 */
import { maskFullName } from '../../common/logging/mask-pii.js';
import { parseFullName } from '../mvp/fio.js';
import { parseImportDate } from '../mvp/learner-import-fields.js';
import { isValidInn } from './validators/inn.js';

import type { ImportRowNote } from './import.types.js';
import type { CdoprofContragent, CdoprofStudent } from './sources/cdoprof-api.schemas.js';

export interface MappedRecord<T> {
  draft?: T;
  /** Строка непереносима — причина словами. */
  error?: ImportRowNote;
  notes: ImportRowNote[];
  raw: Record<string, unknown>;
}

export interface CounterpartyDraft {
  sourceId: string;
  name: string;
  legalName?: string;
  inn?: string;
  kpp?: string;
  email?: string;
}

export interface LearnerDraft {
  sourceId: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  dateOfBirth?: string;
  email?: string;
  phone?: string;
  position?: string;
  login?: string;
  /** СНИЛС: API CDOPROF его не отдаёт, заполняют выгрузки XLSX (срез 23.4). */
  snils?: string;
  /** Компания в CDOPROF (`id_organiz`) — её id источника, не центра. */
  counterpartySourceId?: string;
}

/** Границы правдоподобной даты рождения; числа — настройка с умолчанием, не константа кода. */
export interface BirthDateBounds {
  minYear: number;
  minAgeYears: number;
}

export const DEFAULT_BIRTH_DATE_BOUNDS: BirthDateBounds = { minYear: 1920, minAgeYears: 14 };

/** Пусто, пробелы и строковые «undefined»/«null» из источника — это отсутствие значения. */
const clean = (value: string | null | undefined): string | undefined => {
  const text = (value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null') return undefined;
  return text;
};

const digitsOnly = (value: string | undefined): string | undefined => {
  const digits = (value ?? '').replace(/\s+/g, '');
  return digits || undefined;
};

export const mapContragent = (record: CdoprofContragent): MappedRecord<CounterpartyDraft> => {
  const sourceId = String(record.id);
  const legalName = clean(record.name_organiztion);
  const name = clean(record.short_name) ?? legalName;
  const inn = digitsOnly(clean(record.inn));
  const kpp = digitsOnly(clean(record.kpp));
  const email = clean(record.email);
  /* Юрлицо — не персональные данные; ФИО директора в выжимку не попадает. */
  const raw = { name: name ?? '—', ...(inn ? { inn } : {}), ...(kpp ? { kpp } : {}) };
  const notes: ImportRowNote[] = [];

  if (!name) {
    return {
      error: { code: 'counterparty_name_missing', text: 'У компании в CDOPROF нет названия.' },
      notes,
      raw
    };
  }
  if (inn && !/^\d{10}$|^\d{12}$/.test(inn)) {
    return {
      error: {
        code: 'counterparty_inn_malformed',
        text: `ИНН «${inn}» — не 10 и не 12 цифр. Исправьте его в CDOPROF или заведите компанию вручную.`
      },
      notes,
      raw
    };
  }
  if (inn && !isValidInn(inn)) {
    /* Значение переносится как записано (РМ100), но человек должен его перепроверить. */
    notes.push({
      code: 'counterparty_inn_checksum',
      text: `ИНН «${inn}» не проходит проверку контрольной суммы — перенесён как записан, проверьте.`
    });
  }
  if (!inn) {
    notes.push({
      code: 'counterparty_inn_missing',
      text: 'У компании нет ИНН — сопоставить её с уже заведённой можно только вручную.'
    });
  }
  return {
    draft: {
      sourceId,
      name,
      ...(legalName && legalName !== name ? { legalName } : {}),
      ...(inn ? { inn } : {}),
      ...(kpp ? { kpp } : {}),
      ...(email ? { email } : {})
    },
    notes,
    raw
  };
};

/** `YYYY-MM-DD` за `years` лет до `today` (по UTC, как и даты источника). */
const yearsBefore = (today: Date, years: number): string => {
  const date = new Date(
    Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate())
  );
  return date.toISOString().slice(0, 10);
};

export const mapStudent = (
  record: CdoprofStudent,
  today: Date,
  bounds: BirthDateBounds = DEFAULT_BIRTH_DATE_BOUNDS
): MappedRecord<LearnerDraft> => {
  const sourceId = String(record.id);
  const surname = clean(record.surname);
  const name = clean(record.name);
  const parsed =
    surname && name
      ? {
          lastName: surname,
          firstName: name,
          ...(clean(record.otchestvo) ? { middleName: clean(record.otchestvo)! } : {})
        }
      : parseFullName(clean(record.full_name) ?? '');
  const fullName = [parsed.lastName, parsed.firstName, parsed.middleName].filter(Boolean).join(' ');
  const counterpartySourceId =
    record.id_organiz !== null && record.id_organiz !== undefined && record.id_organiz !== 0
      ? String(record.id_organiz)
      : undefined;
  const raw = {
    name: maskFullName(fullName),
    ...(counterpartySourceId ? { counterpartySourceId } : {})
  };
  const notes: ImportRowNote[] = [];

  if (!parsed.lastName || !parsed.firstName) {
    return {
      error: {
        code: 'learner_name_missing',
        text: 'Нет фамилии или имени — слушателя не опознать. Дополните ФИО в CDOPROF.'
      },
      notes,
      raw
    };
  }

  let dateOfBirth: string | undefined;
  const birthRaw = clean(record.data_rozdeniya);
  if (birthRaw) {
    const parsedDate = parseImportDate(birthRaw);
    const earliest = `${bounds.minYear}-01-01`;
    const latest = yearsBefore(today, bounds.minAgeYears);
    if (parsedDate && parsedDate >= earliest && parsedDate <= latest) {
      dateOfBirth = parsedDate;
    } else {
      /* ТЗ §18: «2109-12-01» не переносится, а попадает в отчёт — строка при этом идёт дальше. */
      notes.push({
        code: 'learner_birth_date_dropped',
        text: `Дата рождения «${birthRaw}» неправдоподобна — не перенесена, заполните вручную.`
      });
    }
  }

  const position = clean(record.dolznost);
  const email = clean(record.email);
  const phone = clean(record.phone);
  const login = clean(record.login);
  return {
    draft: {
      sourceId,
      lastName: parsed.lastName,
      firstName: parsed.firstName,
      ...(parsed.middleName ? { middleName: parsed.middleName } : {}),
      ...(dateOfBirth ? { dateOfBirth } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(position ? { position } : {}),
      ...(login ? { login } : {}),
      ...(counterpartySourceId ? { counterpartySourceId } : {})
    },
    notes,
    raw
  };
};
