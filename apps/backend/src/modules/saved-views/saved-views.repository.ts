/**
 * Сохранённые представления реестров на сервере (ТЗ перехода §11 МГ-H4.1; срез 11.3, РМ106–РМ108):
 * своё представление видит только владелец, общее (`tenant`) — весь центр. Таблица одна на все
 * реестры, экран называется в `entity`.
 */
export type SavedViewScope = 'private' | 'tenant';

export interface SavedViewRecord {
  id: string;
  tenantId: string;
  ownerUserId: string;
  entity: string;
  name: string;
  scope: SavedViewScope;
  filters: Record<string, string>;
  columns: string[];
  sort?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewInsert {
  tenantId: string;
  ownerUserId: string;
  entity: string;
  name: string;
  scope: SavedViewScope;
  filters: Record<string, string>;
  columns: string[];
  sort?: string;
}

export interface SavedViewsRepository {
  /** Свои представления пользователя и общие центра по одному реестру — живые, по имени. */
  listFor(tenantId: string, entity: string, userId: string): Promise<SavedViewRecord[]>;
  get(tenantId: string, id: string): Promise<SavedViewRecord | null>;
  insert(record: SavedViewInsert): Promise<SavedViewRecord>;
  /** Мягкое удаление; `false` — не было. */
  remove(tenantId: string, id: string): Promise<boolean>;
}

export const SAVED_VIEWS_REPOSITORY = Symbol('SAVED_VIEWS_REPOSITORY');

/** Реестры, у которых есть представления; чужой `entity` — отказ, а не мусор в таблице. */
export const SAVED_VIEW_ENTITIES = ['learners', 'groups', 'counterparties', 'tasks'] as const;
export type SavedViewEntity = (typeof SAVED_VIEW_ENTITIES)[number];
