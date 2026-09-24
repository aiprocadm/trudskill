import { InMemoryRegistryRepository } from './in-memory-registry.repository.js';
import { filterGroups } from '../../groups/group-status.js';

import type { GroupListQuery, GroupsRepository } from './groups.repository.js';
import type { LookupItem, RegistryListPage } from './registry-list-query.js';
import type { GroupEntity } from '../../mvp.types.js';

/**
 * Репозиторий групп поверх массива — для тестов и режима `ALLOW_IN_MEMORY_STATE`. Общие
 * фильтры реестра (поиск, статус, скоуп, страница) — от `InMemoryRegistryRepository`, отборы
 * группы (статусы, быстрые отборы, даты, ответственный) — той же функцией, что у снимка.
 */
export class InMemoryGroupsRepository implements GroupsRepository {
  private readonly registry: InMemoryRegistryRepository<GroupEntity & Record<string, unknown>>;

  constructor(private readonly rows: GroupEntity[]) {
    this.registry = new InMemoryRegistryRepository(
      rows as Array<GroupEntity & Record<string, unknown>>,
      'counterpartyId'
    );
  }

  async list(tenantId: string, query: GroupListQuery): Promise<RegistryListPage<GroupEntity>> {
    const {
      statuses,
      quick,
      responsibleUserId,
      startFrom,
      startTo,
      endFrom,
      endTo,
      examFrom,
      examTo,
      includeArchived,
      today,
      ...common
    } = query;
    const filtered = filterGroups(
      this.rows,
      {
        statuses,
        quick,
        responsibleUserId,
        startFrom,
        startTo,
        endFrom,
        endTo,
        examFrom,
        examTo,
        includeArchived
      },
      today
    );
    const scoped = new InMemoryRegistryRepository(
      filtered as Array<GroupEntity & Record<string, unknown>>,
      'counterpartyId'
    );
    // `status` общего фильтра уже учтён списком статусов — в общий не передаём.
    const { status: _status, ...rest } = common;
    void _status;
    return scoped.list(tenantId, rest) as unknown as Promise<RegistryListPage<GroupEntity>>;
  }

  async get(tenantId: string, id: string): Promise<GroupEntity | null> {
    return this.registry.get(tenantId, id) as unknown as Promise<GroupEntity | null>;
  }

  async lookup(tenantId: string, query: GroupListQuery): Promise<RegistryListPage<LookupItem>> {
    const page = await this.list(tenantId, query);
    return {
      ...page,
      items: page.items.map((item) => ({ id: item.id, label: item.name, status: item.status }))
    };
  }
}
