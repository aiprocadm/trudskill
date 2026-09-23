import type { EnrollmentListQuery, EnrollmentsRepository } from './enrollments.repository.js';
import type { RegistryListPage } from './registry-list-query.js';
import type { Enrollment, EnrollmentStatusHistory } from '../../mvp.types.js';

/**
 * Репозиторий зачислений поверх массивов — для тестов и режима `ALLOW_IN_MEMORY_STATE`.
 * Повторяет семантику SQL-репозитория: anti-IDOR по списку слушателей, скоуп заказчика через
 * группы (нужна карта «группа → контрагент»), фильтры и сортировка по белому списку с добивкой по `id`.
 */
export class InMemoryEnrollmentsRepository implements EnrollmentsRepository {
  constructor(
    private readonly rows: Enrollment[],
    private readonly historyRows: EnrollmentStatusHistory[] = [],
    /** `groupId → counterpartyId` для скоупа представителя заказчика. */
    private readonly groupCounterparties: Map<string, string | undefined> = new Map()
  ) {}

  async list(tenantId: string, query: EnrollmentListQuery): Promise<RegistryListPage<Enrollment>> {
    let items = this.rows.filter((row) => row.tenantId === tenantId);
    if (query.learnerIds !== null) {
      const allowed = new Set(query.learnerIds);
      items = items.filter((row) => allowed.has(row.learnerId));
    }
    if (query.counterpartyId) {
      items = items.filter(
        (row) => this.groupCounterparties.get(row.groupId) === query.counterpartyId
      );
    }
    if (query.status) items = items.filter((row) => row.status === query.status);
    if (query.groupId) items = items.filter((row) => row.groupId === query.groupId);
    if (query.learnerId) items = items.filter((row) => row.learnerId === query.learnerId);
    if (query.createdFrom) items = items.filter((row) => row.createdAt >= query.createdFrom!);
    if (query.createdTo) items = items.filter((row) => row.createdAt <= query.createdTo!);
    if (query.plannedEndFrom) {
      items = items.filter(
        (row) => !!row.plannedEndAt && row.plannedEndAt >= query.plannedEndFrom!
      );
    }
    if (query.plannedEndTo) {
      items = items.filter((row) => !!row.plannedEndAt && row.plannedEndAt <= query.plannedEndTo!);
    }
    const column = query.sort?.column ?? 'created_at';
    const field = column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const direction = query.sort?.direction === 'desc' ? -1 : 1;
    items = [...items].sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[field] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[field] ?? '');
      const cmp = av.localeCompare(bv) * direction;
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
    const from = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(from, from + query.pageSize).map((row) => ({ ...row })),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length
    };
  }

  async get(tenantId: string, id: string): Promise<Enrollment | null> {
    const found = this.rows.find((row) => row.tenantId === tenantId && row.id === id);
    return found ? { ...found } : null;
  }

  async history(tenantId: string, enrollmentId: string): Promise<EnrollmentStatusHistory[]> {
    return this.historyRows
      .filter((row) => row.tenantId === tenantId && row.enrollmentId === enrollmentId)
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt) || a.id.localeCompare(b.id))
      .map((row) => ({ ...row }));
  }
}
