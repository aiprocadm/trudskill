import type { BaseFilterQuery } from '../../mvp.dto.js';

/**
 * Параметры списка реестра для SQL-репозиториев (Фаза 1 ТЗ перехода с CDOPROF, срез 1b,
 * МГ-A2.1: те же `q, status, page, page_size, sort`, контракт не меняется).
 *
 * Разбор повторяет `MvpService.list` (журнал 277 / решение Р16): параметры с проволоки приходят
 * СТРОКАМИ; потолок 200 применяется только к строковым `page_size`, внутренние вызовы числом
 * потолка не имеют; по умолчанию — 50.
 *
 * Отличия от снимка, записанные как дрейф контракта (РМ36):
 *   • `q` в снимке искал подстроку во всём JSON сущности (включая id и даты); в SQL — по коду,
 *     названию, ИНН/юрназванию и `payload` (поля импорта);
 *   • `sort` в снимке принимал любое поле; в SQL — только колонки из белого списка, остальное
 *     даёт порядок по умолчанию `created_at asc, id asc` (фронт `sort` не шлёт).
 */

export const LIST_PAGE_SIZE = 50;
export const LIST_PAGE_SIZE_MAX = 200;

export type SortDirection = 'asc' | 'desc';

export interface RegistryListQuery {
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
  sort?: { column: string; direction: SortDirection };
  /** Скоуп представителя заказчика: только сущности этого контрагента (портал). */
  counterpartyId?: string;
}

export interface RegistryListPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LookupItem {
  id: string;
  label: string;
  status: string;
}

/** Белый список сортировок: поле сущности → колонка таблицы. */
export const COMMON_SORT_COLUMNS: Record<string, string> = {
  id: 'id',
  code: 'code',
  name: 'name',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

export function parseRegistryListQuery(
  query: BaseFilterQuery,
  sortColumns: Record<string, string>,
  scope?: { counterpartyId?: string }
): RegistryListQuery {
  const sizeFromWire = typeof (query.page_size as unknown) === 'string';
  const rawPage = Number(query.page ?? 1);
  const rawSize = Number(query.page_size ?? LIST_PAGE_SIZE);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.trunc(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1
      ? sizeFromWire
        ? Math.min(LIST_PAGE_SIZE_MAX, Math.trunc(rawSize))
        : Math.trunc(rawSize)
      : LIST_PAGE_SIZE;

  const result: RegistryListQuery = { page, pageSize };
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q) result.q = q;
  if (typeof query.status === 'string' && query.status) result.status = query.status;
  if (typeof query.sort === 'string' && query.sort) {
    const [rawKey, rawDirection] = query.sort.split(':');
    const column = sortColumns[rawKey ?? ''];
    if (column) result.sort = { column, direction: rawDirection === 'desc' ? 'desc' : 'asc' };
  }
  const counterpartyId = scope?.counterpartyId?.trim();
  if (counterpartyId) result.counterpartyId = counterpartyId;
  return result;
}

/** Шаблон для `ilike`: подстрока без учёта регистра, спецсимволы шаблона экранированы. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
