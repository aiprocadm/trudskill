/**
 * Справочники личного дела (ТЗ перехода §6.4 МГ-C1.2; срез 8.13, РМ80–РМ83).
 *
 * Должности — на центр (`lookup.positions`, уникальность без учёта регистра); уровни
 * образования и страны — глобальные списки (`lookup.education_levels`, `lookup.countries`),
 * которые в памяти берутся из сида, а в Postgres — из таблиц с тем же сидом.
 */
export const LOOKUP_REPOSITORY = Symbol('LOOKUP_REPOSITORY');

export interface PositionRow {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
}

export interface CodeNameRow {
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface LookupRepository {
  /** Подсказки должностей центра: по вхождению без учёта регистра, не больше `limit`. */
  listPositions(tenantId: string, q: string, limit: number): Promise<PositionRow[]>;
  /** Дописать недостающие должности одной операцией; вернуть, сколько строк появилось. */
  rememberPositions(tenantId: string, names: ReadonlyArray<string>): Promise<number>;
  listEducationLevels(): Promise<CodeNameRow[]>;
  listCountries(): Promise<CodeNameRow[]>;
}
