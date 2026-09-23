import type { CounterpartiesRepository } from './counterparties.repository.js';
import type { GroupsRepository } from './groups.repository.js';
import type { LookupItem, RegistryListPage, RegistryListQuery } from './registry-list-query.js';

interface RegistryEntity {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
  counterpartyId?: string;
  [key: string]: unknown;
}

/**
 * Репозиторий реестра поверх массива — для тестов и режима `ALLOW_IN_MEMORY_STATE` (нормализованной
 * таблицы там нет). Повторяет семантику SQL-репозиториев, а не снимка: поиск по коду/названию/
 * остальным строковым полям, сортировка по белому списку с добивкой по `id`, скоуп по контрагенту.
 */
export class InMemoryRegistryRepository<T extends RegistryEntity>
  implements CounterpartiesRepository, GroupsRepository
{
  constructor(
    private readonly rows: T[],
    /** Как скоуп портала применяется к сущности: контрагент — по `id`, группа — по `counterpartyId`. */
    private readonly scopeField: 'id' | 'counterpartyId'
  ) {}

  async list(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<never>> {
    let items = this.rows.filter((row) => row.tenantId === tenantId);
    if (query.counterpartyId) {
      items = items.filter((row) => row[this.scopeField] === query.counterpartyId);
    }
    if (query.status) items = items.filter((row) => row.status === query.status);
    if (query.q) {
      const needle = query.q.toLowerCase();
      items = items.filter((row) =>
        Object.entries(row).some(
          ([key, value]) =>
            key !== 'id' &&
            key !== 'tenantId' &&
            typeof value === 'string' &&
            value.toLowerCase().includes(needle)
        )
      );
    }
    const column = query.sort?.column ?? 'created_at';
    const field = column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const direction = query.sort?.direction === 'desc' ? -1 : 1;
    items = [...items].sort((a, b) => {
      const cmp = String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * direction;
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
    const from = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(from, from + query.pageSize) as never[],
      page: query.page,
      pageSize: query.pageSize,
      total: items.length
    };
  }

  async get(tenantId: string, id: string): Promise<never | null> {
    return (this.rows.find((row) => row.tenantId === tenantId && row.id === id) as never) ?? null;
  }

  async lookup(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<LookupItem>> {
    const page = await this.list(tenantId, query);
    return {
      ...page,
      items: (page.items as T[]).map((item) => ({
        id: item.id,
        label: item.name,
        status: item.status
      }))
    };
  }
}
