import type { ExamResultListQuery, ExamResultsRepository } from './exam-results.repository.js';
import type { RegistryListPage } from './registry-list-query.js';
import type { ExamResult } from '../../mvp.types.js';

/**
 * Репозиторий результатов экзаменов поверх массива — для тестов и режима `ALLOW_IN_MEMORY_STATE`.
 * Повторяет семантику SQL-репозитория: anti-IDOR по списку слушателей, фильтры по зачислению,
 * слушателю, тесту и статусу, сортировка по белому списку с добивкой по `id`.
 */
export class InMemoryExamResultsRepository implements ExamResultsRepository {
  constructor(private readonly rows: ExamResult[]) {}

  async list(tenantId: string, query: ExamResultListQuery): Promise<RegistryListPage<ExamResult>> {
    let items = this.rows.filter((row) => row.tenantId === tenantId);
    if (query.learnerIds !== null) {
      const allowed = new Set(query.learnerIds);
      items = items.filter((row) => allowed.has(row.learnerId));
    }
    if (query.status) items = items.filter((row) => row.status === query.status);
    if (query.enrollmentId) items = items.filter((row) => row.enrollmentId === query.enrollmentId);
    if (query.learnerId) items = items.filter((row) => row.learnerId === query.learnerId);
    if (query.testId) items = items.filter((row) => row.testId === query.testId);
    const column = query.sort?.column ?? 'created_at';
    const field =
      column === 'is_passed'
        ? 'passed'
        : column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const direction = query.sort?.direction === 'desc' ? -1 : 1;
    items = [...items].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[field];
      const bv = (b as unknown as Record<string, unknown>)[field];
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? (av - bv) * direction
          : String(av ?? '').localeCompare(String(bv ?? '')) * direction;
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

  async get(tenantId: string, id: string): Promise<ExamResult | null> {
    const found = this.rows.find((row) => row.tenantId === tenantId && row.id === id);
    return found ? { ...found } : null;
  }

  async byEnrollment(tenantId: string, enrollmentId: string): Promise<ExamResult[]> {
    return this.rows
      .filter((row) => row.tenantId === tenantId && row.enrollmentId === enrollmentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((row) => ({ ...row }));
  }
}
