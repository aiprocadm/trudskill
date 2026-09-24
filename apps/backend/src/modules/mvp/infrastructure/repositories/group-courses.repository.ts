import type { RegistryListPage, RegistryListQuery } from './registry-list-query.js';
import type { GroupCourse } from '../../mvp.types.js';

/**
 * Репозиторий курсов группы (МГ-A1.1/A1.2, Фаза 1 срез 4b). Читает `learning.group_courses`,
 * которую наполняют бэкфилл и проекция при сохранении снимка (срез 4a). Скоупа и anti-IDOR у
 * курсов группы нет — как в снимке (`groups.read` есть только у персонала центра).
 */
export const GROUP_COURSES_REPOSITORY = Symbol('GROUP_COURSES_REPOSITORY');

export interface GroupCourseListQuery extends RegistryListQuery {
  groupId?: string;
  courseId?: string;
  courseVersionId?: string;
}

export interface GroupCoursesRepository {
  list(tenantId: string, query: GroupCourseListQuery): Promise<RegistryListPage<GroupCourse>>;
  get(tenantId: string, id: string): Promise<GroupCourse | null>;
}
