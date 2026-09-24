/**
 * МГ-D2.1 (срез 14.1): люди компании-заказчика.
 *
 * **Контактное лицо** — с кем центр общается (кадровик, директор, бухгалтер); его можно
 * пригласить представителем в портал заказчика (срез 14.3). **Сотрудник** — тот, кого учат;
 * при зачислении становится слушателем, связь хранится в обе стороны (`learnerId` здесь,
 * `Learner.counterpartyEmployeeId` в снимке).
 *
 * Хранятся прямо в `crm.counterparty_contacts` / `crm.counterparty_employees` (РМ116): их
 * тысячи на компанию, в снимок центра они не помещаются.
 */

export type ContactStatus = 'active' | 'archived';
export const CONTACT_STATUSES: readonly ContactStatus[] = ['active', 'archived'];

export type EmployeeStatus = 'active' | 'inactive' | 'dismissed';
export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = ['active', 'inactive', 'dismissed'];

export interface CounterpartyContact {
  id: string;
  tenantId: string;
  counterpartyId: string;
  firstName: string;
  lastName?: string;
  position?: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
  status: ContactStatus;
  /** Учётная запись представителя в портале — ставит приглашение (срез 14.3). */
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CounterpartyEmployee {
  id: string;
  tenantId: string;
  counterpartyId: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  position?: string;
  email?: string;
  phone?: string;
  /** Табельный номер — уникален у компании, только когда задан (РМ117). */
  employeeNo?: string;
  status: EmployeeStatus;
  /** Слушатель, которым сотрудник стал при зачислении (РМ118: без внешнего ключа). */
  learnerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeesQuery {
  q?: string;
  status?: EmployeeStatus;
  page: number;
  pageSize: number;
}

export interface EmployeesPage {
  items: CounterpartyEmployee[];
  total: number;
  page: number;
  pageSize: number;
}

/** Итог массового добавления — частичный успех, отказы поимённо. */
export interface EmployeesBulkRow {
  rowNumber: number;
  status: 'created' | 'skipped' | 'failed';
  employeeId?: string;
  fullName?: string;
  reason?: string;
}

export interface EmployeesBulkOutcome {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  rows: EmployeesBulkRow[];
}
