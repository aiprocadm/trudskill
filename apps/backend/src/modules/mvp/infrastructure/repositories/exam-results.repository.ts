import type { RegistryListPage, RegistryListQuery } from './registry-list-query.js';
import type { ExamResult } from '../../mvp.types.js';

/**
 * Репозиторий результатов экзаменов (МГ-A1.1/A1.2, Фаза 1 срез 4b). Читает
 * `assessment.exam_results`, которую наполняют бэкфилл и проекция при сохранении снимка
 * (срез 4a). Anti-IDOR (§5.160) выражается параметром `learnerIds` — как у зачислений: `null`
 * — без ограничения, массив — только эти слушатели (пустой — закрыто по умолчанию). Кому что
 * положено, решает сервис чтения — ровно как `MvpService`.
 */
export const EXAM_RESULTS_REPOSITORY = Symbol('EXAM_RESULTS_REPOSITORY');

export interface ExamResultListQuery extends RegistryListQuery {
  enrollmentId?: string;
  learnerId?: string;
  testId?: string;
  /** Anti-IDOR: `null` — без ограничения; массив — только эти слушатели (пустой — ничего). */
  learnerIds: string[] | null;
}

export interface ExamResultsRepository {
  list(tenantId: string, query: ExamResultListQuery): Promise<RegistryListPage<ExamResult>>;
  get(tenantId: string, id: string): Promise<ExamResult | null>;
  /** Все результаты зачисления в порядке создания; неизвестное зачисление — пусто. */
  byEnrollment(tenantId: string, enrollmentId: string): Promise<ExamResult[]>;
}
