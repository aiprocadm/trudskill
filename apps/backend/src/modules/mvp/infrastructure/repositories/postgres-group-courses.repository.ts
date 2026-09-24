import { Inject, Injectable } from '@nestjs/common';

import { type RegistryListPage, parseRegistryListQuery } from './registry-list-query.js';
import { DatabaseService } from '../../../../infrastructure/database/database.service.js';
import { rowToEntity } from '../../../migration/backfill/normalized/normalized-projection.js';

import type { GroupCourseListQuery, GroupCoursesRepository } from './group-courses.repository.js';
import type { BaseFilterQuery } from '../../mvp.dto.js';
import type { GroupCourse } from '../../mvp.types.js';

/** Белый список сортировок курсов группы. */
export const GROUP_COURSE_SORT_COLUMNS: Record<string, string> = {
  id: 'id',
  sortOrder: 'sort_order',
  status: 'status',
  durationDays: 'duration_days',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

const COLUMNS =
  'id, tenant_id, created_at, updated_at, group_id, course_id, course_version_id, sort_order, ' +
  'duration_days, requires_pre_exam_auth, requires_identity_verification, requires_proctoring, ' +
  'status, payload';

/**
 * Параметры списка курсов группы из строки запроса: общие (`page/page_size/sort/status`) плюс
 * фильтры, которые снимок применял к курсам группы (`group_id`, `course_id`, `course_version_id`).
 * `q` не применяется (журнал 614: в снимке он искал подстроку по JSON), остальные фильтры
 * `BaseFilterQuery` игнорируются — в снимке они давали пустой список.
 */
export function parseGroupCourseListQuery(query: BaseFilterQuery): GroupCourseListQuery {
  const base = parseRegistryListQuery(query, GROUP_COURSE_SORT_COLUMNS);
  delete base.q;
  const result: GroupCourseListQuery = { ...base };
  if (typeof query.group_id === 'string' && query.group_id) result.groupId = query.group_id;
  if (typeof query.course_id === 'string' && query.course_id) result.courseId = query.course_id;
  if (typeof query.course_version_id === 'string' && query.course_version_id) {
    result.courseVersionId = query.course_version_id;
  }
  return result;
}

/**
 * Курсы группы из `learning.group_courses` (Фаза 1, срез 4b). Порядок по умолчанию —
 * `created_at asc, id asc`, как порядок массива снимка (`sortOrder` равен номеру создания
 * во всём центре — журнал 620, поэтому отдельно сортировать по нему смысла нет; явная
 * сортировка `sortOrder` доступна по белому списку).
 */
@Injectable()
export class PostgresGroupCoursesRepository implements GroupCoursesRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(
    tenantId: string,
    query: GroupCourseListQuery
  ): Promise<RegistryListPage<GroupCourse>> {
    const { extra, params } = this.filters(tenantId, query);
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from learning.group_courses where tenant_id = $1 ${extra}`,
      params
    );
    const sort = query.sort ?? { column: 'created_at', direction: 'asc' as const };
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.group_courses
        where tenant_id = $1 ${extra}
        order by ${sort.column} ${sort.direction}, id asc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      items: rows.map((row) => rowToEntity('groupCourses', row) as unknown as GroupCourse),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totals[0]?.total ?? 0)
    };
  }

  async get(tenantId: string, id: string): Promise<GroupCourse | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.group_courses where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? (rowToEntity('groupCourses', rows[0]) as unknown as GroupCourse) : null;
  }

  /** Дополнительные условия к `where tenant_id = $1` (само условие — в тексте запроса, для сторожа). */
  private filters(
    tenantId: string,
    query: GroupCourseListQuery
  ): { extra: string; params: unknown[] } {
    const params: unknown[] = [tenantId];
    const conditions: string[] = [];
    const push = (value: unknown, condition: (p: string) => string): void => {
      params.push(value);
      conditions.push(condition(`$${params.length}`));
    };
    if (query.status) push(query.status, (p) => `status = ${p}`);
    if (query.groupId) push(query.groupId, (p) => `group_id = ${p}`);
    if (query.courseId) push(query.courseId, (p) => `course_id = ${p}`);
    if (query.courseVersionId) push(query.courseVersionId, (p) => `course_version_id = ${p}`);
    return { extra: conditions.map((c) => `and ${c}`).join(' '), params };
  }
}
