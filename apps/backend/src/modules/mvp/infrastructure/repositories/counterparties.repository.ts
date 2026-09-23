import type { LookupItem, RegistryListPage, RegistryListQuery } from './registry-list-query.js';
import type { Counterparty } from '../../mvp.types.js';

/**
 * Репозиторий контрагентов (МГ-A1.2: «одна коллекция — один репозиторий»). Читает
 * нормализованную таблицу `crm.counterparties`, которую наполняют бэкфилл (срез 0b) и проекция
 * при сохранении снимка (срез 1a). Форма ответа — та же, что у снимка: сущность `Counterparty`
 * с полями импорта из `payload` (обратная проекция `rowToEntity`).
 */
export const COUNTERPARTIES_REPOSITORY = Symbol('COUNTERPARTIES_REPOSITORY');

export interface CounterpartiesRepository {
  list(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<Counterparty>>;
  get(tenantId: string, id: string): Promise<Counterparty | null>;
  lookup(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<LookupItem>>;
}
