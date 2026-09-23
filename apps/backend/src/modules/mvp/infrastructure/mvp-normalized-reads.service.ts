import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { resolveCounterpartyScope, scopeAllows } from '../counterparty-scope.js';
import { COUNTERPARTIES_REPOSITORY } from './repositories/counterparties.repository.js';
import { GROUPS_REPOSITORY } from './repositories/groups.repository.js';
import { COUNTERPARTY_SORT_COLUMNS } from './repositories/postgres-counterparties.repository.js';
import { GROUP_SORT_COLUMNS } from './repositories/postgres-groups.repository.js';
import { parseRegistryListQuery } from './repositories/registry-list-query.js';

import type { BaseFilterQuery } from '../mvp.dto.js';
import type { Counterparty, GroupEntity } from '../mvp.types.js';
import type { CounterpartiesRepository } from './repositories/counterparties.repository.js';
import type { GroupsRepository } from './repositories/groups.repository.js';
import type { LookupItem, RegistryListPage } from './repositories/registry-list-query.js';

/**
 * Чтение контрагентов и групп из нормализованных таблиц (Фаза 1, срез 1b) — зеркало методов
 * `MvpService` (`listGroups`, `getGroup`, `lookupGroups` и то же для контрагентов) с той же
 * формой ответа и теми же правилами, но асинхронное и без снимка: контроллер выбирает между ними по флагу `LMS_NORMALIZED_COLLECTIONS`.
 *
 * Правила скоупа — из снимка: представитель заказчика видит только своего контрагента и группы
 * своего контрагента; чужая запись отдаёт 404 с тем же кодом, что и несуществующая (иначе отказ
 * выдавал бы факт её существования). `lookup` и `getGroup` скоуп не применяют — как в снимке:
 * у представителя нет прав `groups.read`/`counterparties.read`, а у портала свои ручки.
 */
@Injectable()
export class MvpNormalizedReadsService {
  constructor(
    @Inject(COUNTERPARTIES_REPOSITORY) private readonly counterparties: CounterpartiesRepository,
    @Inject(GROUPS_REPOSITORY) private readonly groups: GroupsRepository
  ) {}

  listCounterparties(
    tenantId: string,
    query: BaseFilterQuery,
    actor?: { counterpartyId?: string }
  ): Promise<RegistryListPage<Counterparty>> {
    const scope = resolveCounterpartyScope(actor ?? {});
    return this.counterparties.list(
      tenantId,
      parseRegistryListQuery(query, COUNTERPARTY_SORT_COLUMNS, scope.restricted ? scope : undefined)
    );
  }

  async getCounterparty(
    tenantId: string,
    id: string,
    actor?: { counterpartyId?: string }
  ): Promise<Counterparty> {
    const scope = resolveCounterpartyScope(actor ?? {});
    if (scope.restricted && !scopeAllows(scope, id)) {
      throw new NotFoundException({ code: 'not_found', message: 'Counterparty not found' });
    }
    const found = await this.counterparties.get(tenantId, id);
    if (!found) throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    return found;
  }

  lookupCounterparties(
    tenantId: string,
    query: BaseFilterQuery
  ): Promise<RegistryListPage<LookupItem>> {
    return this.counterparties.lookup(
      tenantId,
      parseRegistryListQuery(query, COUNTERPARTY_SORT_COLUMNS)
    );
  }

  listGroups(
    tenantId: string,
    query: BaseFilterQuery,
    actor?: { counterpartyId?: string }
  ): Promise<RegistryListPage<GroupEntity>> {
    const scope = resolveCounterpartyScope(actor ?? {});
    return this.groups.list(
      tenantId,
      parseRegistryListQuery(query, GROUP_SORT_COLUMNS, scope.restricted ? scope : undefined)
    );
  }

  async getGroup(tenantId: string, id: string): Promise<GroupEntity> {
    const found = await this.groups.get(tenantId, id);
    if (!found) throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    return found;
  }

  lookupGroups(tenantId: string, query: BaseFilterQuery): Promise<RegistryListPage<LookupItem>> {
    return this.groups.lookup(tenantId, parseRegistryListQuery(query, GROUP_SORT_COLUMNS));
  }
}
