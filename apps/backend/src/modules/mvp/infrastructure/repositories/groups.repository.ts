import type { LookupItem, RegistryListPage, RegistryListQuery } from './registry-list-query.js';
import type { GroupEntity } from '../../mvp.types.js';

/**
 * Репозиторий учебных групп (МГ-A1.2). Читает `learning.groups` (бэкфилл + проекция при
 * сохранении снимка). Скоуп представителя заказчика — `query.counterpartyId` (портал):
 * группа без контрагента представителю не видна (правило `scopeAllows`).
 */
export const GROUPS_REPOSITORY = Symbol('GROUPS_REPOSITORY');

export interface GroupsRepository {
  list(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<GroupEntity>>;
  get(tenantId: string, id: string): Promise<GroupEntity | null>;
  lookup(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<LookupItem>>;
}
