import type { GroupCourseListQuery, GroupCoursesRepository } from './group-courses.repository.js';
import type { RegistryListPage } from './registry-list-query.js';
import type { GroupCourse } from '../../mvp.types.js';

/**
 * Репозиторий курсов группы поверх массива — для тестов и режима `ALLOW_IN_MEMORY_STATE`.
 * Повторяет семантику SQL-репозитория: фильтры по группе/курсу/версии/статусу, сортировка по
 * белому списку с добивкой по `id`, страница по размеру.
 */
export class InMemoryGroupCoursesRepository implements GroupCoursesRepository {
  constructor(private readonly rows: GroupCourse[]) {}

  async list(
    tenantId: string,
    query: GroupCourseListQuery
  ): Promise<RegistryListPage<GroupCourse>> {
    let items = this.rows.filter((row) => row.tenantId === tenantId);
    if (query.status) items = items.filter((row) => row.status === query.status);
    if (query.groupId) items = items.filter((row) => row.groupId === query.groupId);
    if (query.courseId) items = items.filter((row) => row.courseId === query.courseId);
    if (query.courseVersionId) {
      items = items.filter((row) => row.courseVersionId === query.courseVersionId);
    }
    const column = query.sort?.column ?? 'created_at';
    const field = column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
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

  async get(tenantId: string, id: string): Promise<GroupCourse | null> {
    const found = this.rows.find((row) => row.tenantId === tenantId && row.id === id);
    return found ? { ...found } : null;
  }
}
