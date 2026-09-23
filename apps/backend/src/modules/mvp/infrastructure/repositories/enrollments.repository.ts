import type { RegistryListPage, RegistryListQuery } from './registry-list-query.js';
import type { Enrollment, EnrollmentStatusHistory } from '../../mvp.types.js';

/**
 * Репозиторий зачислений (МГ-A1.1/A1.2, Фаза 1 срез 3b). Читает `learning.enrollments` и
 * `learning.enrollment_status_history`, которые наполняют бэкфилл и проекция при сохранении
 * снимка (срез 3a).
 *
 * Правила доступа (§5.160 anti-IDOR, ФТ-E5) выражаются параметрами запроса, а не решаются
 * здесь: `learnerIds` — ограничение «только свои зачисления» (`null` — без ограничения, пустой
 * массив — закрыто по умолчанию), `counterpartyId` — скоуп представителя заказчика через группы
 * его контрагента. Что и когда применять, знает сервис чтения — ровно как `MvpService`.
 */
export const ENROLLMENTS_REPOSITORY = Symbol('ENROLLMENTS_REPOSITORY');

export interface EnrollmentListQuery extends RegistryListQuery {
  groupId?: string;
  learnerId?: string;
  createdFrom?: string;
  createdTo?: string;
  plannedEndFrom?: string;
  plannedEndTo?: string;
  /** Anti-IDOR: `null` — без ограничения; массив — только эти слушатели (пустой — ничего). */
  learnerIds: string[] | null;
}

export interface EnrollmentsRepository {
  list(tenantId: string, query: EnrollmentListQuery): Promise<RegistryListPage<Enrollment>>;
  get(tenantId: string, id: string): Promise<Enrollment | null>;
  /** История статусов в порядке смены; неизвестное зачисление — пусто, как в снимке. */
  history(tenantId: string, enrollmentId: string): Promise<EnrollmentStatusHistory[]>;
}
