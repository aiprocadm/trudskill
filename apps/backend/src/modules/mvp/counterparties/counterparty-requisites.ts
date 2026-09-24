import type { Counterparty } from '../mvp.types.js';

/**
 * МГ-D1.1 (срез 13.1): реквизиты контрагента, которые переносятся из тела запроса как есть.
 * Колонки для них созданы миграцией 0106; здесь — один список для создания и правки, чтобы
 * новое поле не пришлось дописывать в двух местах службы.
 *
 * Семантика правки: поле отсутствует — не трогать; `null` или пустая строка — очистить.
 */
export const COUNTERPARTY_REQUISITE_FIELDS = [
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
  'managerUserId',
  'contractNumber',
  'contractDate'
] as const satisfies ReadonlyArray<keyof Counterparty>;

export type CounterpartyRequisiteField = (typeof COUNTERPARTY_REQUISITE_FIELDS)[number];

export type CounterpartyRequisitesPatch = Partial<
  Record<CounterpartyRequisiteField, string | null>
>;

/** Переносит реквизиты из тела в сущность: пробелы по краям срезаются, пустое — очищает. */
export function applyCounterpartyRequisites(
  target: Counterparty,
  patch: CounterpartyRequisitesPatch
): void {
  for (const field of COUNTERPARTY_REQUISITE_FIELDS) {
    const raw = patch[field];
    if (raw === undefined) continue;
    const value = raw?.trim();
    if (value) target[field] = value;
    else delete target[field];
  }
}
