import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type AuditLogRecord, AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';

export interface CourseHistoryItem {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  actorName?: string;
  system: boolean;
}

export interface CourseHistory {
  items: CourseHistoryItem[];
  truncated: boolean;
}

export const COURSE_HISTORY_LIMIT = 100;
/** Версий курса в истории — последних N: их правки видны, а запросов к журналу не сотни. */
const VERSIONS_CAP = 20;

/**
 * История курса (МГ-E2.3, срез 16.4): «контроль изменений — версии + история». Лента из журнала
 * действий по самому курсу (заведён, изменён, опубликован, в архиве) и по его версиям (новая
 * версия, параметры программы, публикация версии) — кто и когда, по-русски на экране.
 */
@Injectable()
export class CourseHistoryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async compose(tenantId: string, courseId: string): Promise<CourseHistory> {
    const course = this.state.courses.find((c) => c.tenantId === tenantId && c.id === courseId);
    if (!course) {
      throw new NotFoundException({ code: 'not_found', message: 'Курс не найден' });
    }
    const versionIds = this.state.courseVersions
      .filter((v) => v.tenantId === tenantId && v.courseId === courseId)
      .sort((a, b) => b.versionNo - a.versionNo)
      .map((v) => v.id)
      .slice(0, VERSIONS_CAP);

    const queries = [
      { entity: 'learning.course', entityId: courseId },
      ...versionIds.map((entityId) => ({ entity: 'learning.course_version', entityId }))
    ];
    const pages = await Promise.all(
      queries.map((filter) =>
        this.audit.listPage(tenantId, { ...filter, limit: COURSE_HISTORY_LIMIT })
      )
    );

    const seen = new Set<string>();
    const records = pages
      .flatMap((page) => page.items)
      .filter((record) => record.tenantId === tenantId)
      .filter((record) => (seen.has(record.id) ? false : (seen.add(record.id), true)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      items: records.slice(0, COURSE_HISTORY_LIMIT).map(toItem),
      truncated: records.length > COURSE_HISTORY_LIMIT
    };
  }
}

const toItem = (record: AuditLogRecord): CourseHistoryItem => ({
  id: record.id,
  createdAt: record.createdAt,
  action: record.action,
  entityType: record.entityType,
  ...(record.actorName ? { actorName: record.actorName } : {}),
  system: !record.actorId
});
