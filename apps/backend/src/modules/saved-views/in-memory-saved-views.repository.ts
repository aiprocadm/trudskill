import type {
  SavedViewInsert,
  SavedViewRecord,
  SavedViewsRepository
} from './saved-views.repository.js';

type StoredRow = SavedViewRecord & { deleted: boolean };

/** Наружу — запись без служебного признака удаления. */
const publicOf = (row: StoredRow): SavedViewRecord => {
  const { deleted, ...rest } = row;
  void deleted;
  return rest;
};

/** Память — режим `ALLOW_IN_MEMORY_STATE` и тесты службы; семантика та же, что у SQL. */
export class InMemorySavedViewsRepository implements SavedViewsRepository {
  private readonly rows: StoredRow[] = [];
  private seq = 0;

  async listFor(tenantId: string, entity: string, userId: string): Promise<SavedViewRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.entity === entity &&
          !row.deleted &&
          (row.ownerUserId === userId || row.scope === 'tenant')
      )
      .sort(
        (a, b) =>
          b.scope.localeCompare(a.scope) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      )
      .map(publicOf);
  }

  async get(tenantId: string, id: string): Promise<SavedViewRecord | null> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id && !r.deleted);
    if (!row) return null;
    return publicOf(row);
  }

  async insert(record: SavedViewInsert): Promise<SavedViewRecord> {
    this.seq += 1;
    const now = new Date().toISOString();
    const row: StoredRow = {
      id: `sv_mem_${this.seq}`,
      tenantId: record.tenantId,
      ownerUserId: record.ownerUserId,
      entity: record.entity,
      name: record.name,
      scope: record.scope,
      filters: { ...record.filters },
      columns: [...record.columns],
      ...(record.sort ? { sort: record.sort } : {}),
      createdAt: now,
      updatedAt: now,
      deleted: false
    };
    this.rows.push(row);
    return publicOf(row);
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id && !r.deleted);
    if (!row) return false;
    row.deleted = true;
    return true;
  }
}
