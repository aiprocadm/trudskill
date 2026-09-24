import { Inject, Injectable } from '@nestjs/common';

import { type RegistryListPage, parseRegistryListQuery } from './registry-list-query.js';
import { DatabaseService } from '../../../../infrastructure/database/database.service.js';
import { rowToEntity } from '../../../migration/backfill/normalized/normalized-projection.js';

import type { ExamResultListQuery, ExamResultsRepository } from './exam-results.repository.js';
import type { BaseFilterQuery } from '../../mvp.dto.js';
import type { ExamResult } from '../../mvp.types.js';

/** Белый список сортировок результатов экзаменов. */
export const EXAM_RESULT_SORT_COLUMNS: Record<string, string> = {
  id: 'id',
  status: 'status',
  passed: 'is_passed',
  finalScore: 'final_score',
  bestScore: 'best_score',
  attemptsCount: 'attempts_count',
  finalizedAt: 'finalized_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

const COLUMNS =
  'id, tenant_id, created_at, updated_at, enrollment_id, learner_id, test_id, best_attempt_id, ' +
  'final_score, is_passed, status, finalized_at, attempts_count, best_score, max_score, ' +
  'passing_score, payload';

/**
 * Параметры списка результатов из строки запроса: общие (`page/page_size/sort/status`) плюс
 * фильтры, которые снимок применял к результатам (`enrollment_id`, `learner_id`, `test_id`).
 * `q` не применяется (журнал 614), остальные фильтры `BaseFilterQuery` игнорируются — в снимке
 * они давали пустой список.
 */
export function parseExamResultListQuery(
  query: BaseFilterQuery,
  learnerIds: string[] | null
): ExamResultListQuery {
  const base = parseRegistryListQuery(query, EXAM_RESULT_SORT_COLUMNS);
  delete base.q;
  const result: ExamResultListQuery = { ...base, learnerIds };
  if (typeof query.enrollment_id === 'string' && query.enrollment_id) {
    result.enrollmentId = query.enrollment_id;
  }
  if (typeof query.learner_id === 'string' && query.learner_id) result.learnerId = query.learner_id;
  if (typeof query.test_id === 'string' && query.test_id) result.testId = query.test_id;
  return result;
}

/**
 * Результаты экзаменов из `assessment.exam_results` (Фаза 1, срез 4b). Anti-IDOR — `learner_id`
 * из переданного списка (индекс 0108 по слушателю). Порядок по умолчанию — `created_at asc,
 * id asc`, как порядок массива снимка. Баллы приходят строками `numeric` и превращаются в числа
 * обратной проекцией (`rowToEntity`); точность колонки — сотые (журнал 617).
 */
@Injectable()
export class PostgresExamResultsRepository implements ExamResultsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string, query: ExamResultListQuery): Promise<RegistryListPage<ExamResult>> {
    if (query.learnerIds !== null && query.learnerIds.length === 0) {
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    }
    const { extra, params } = this.filters(tenantId, query);
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from assessment.exam_results where tenant_id = $1 ${extra}`,
      params
    );
    const sort = query.sort ?? { column: 'created_at', direction: 'asc' as const };
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from assessment.exam_results
        where tenant_id = $1 ${extra}
        order by ${sort.column} ${sort.direction}, id asc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      items: rows.map((row) => rowToEntity('examResults', row) as unknown as ExamResult),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totals[0]?.total ?? 0)
    };
  }

  async get(tenantId: string, id: string): Promise<ExamResult | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from assessment.exam_results where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? (rowToEntity('examResults', rows[0]) as unknown as ExamResult) : null;
  }

  async byEnrollment(tenantId: string, enrollmentId: string): Promise<ExamResult[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from assessment.exam_results
        where tenant_id = $1 and enrollment_id = $2
        order by created_at asc, id asc`,
      [tenantId, enrollmentId]
    );
    return rows.map((row) => rowToEntity('examResults', row) as unknown as ExamResult);
  }

  /** Дополнительные условия к `where tenant_id = $1` (само условие — в тексте запроса, для сторожа). */
  private filters(
    tenantId: string,
    query: ExamResultListQuery
  ): { extra: string; params: unknown[] } {
    const params: unknown[] = [tenantId];
    const conditions: string[] = [];
    const push = (value: unknown, condition: (p: string) => string): void => {
      params.push(value);
      conditions.push(condition(`$${params.length}`));
    };
    if (query.learnerIds !== null) push(query.learnerIds, (p) => `learner_id = any(${p}::text[])`);
    if (query.status) push(query.status, (p) => `status = ${p}`);
    if (query.enrollmentId) push(query.enrollmentId, (p) => `enrollment_id = ${p}`);
    if (query.learnerId) push(query.learnerId, (p) => `learner_id = ${p}`);
    if (query.testId) push(query.testId, (p) => `test_id = ${p}`);
    return { extra: conditions.map((c) => `and ${c}`).join(' '), params };
  }
}
