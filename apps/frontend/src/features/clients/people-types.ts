/**
 * МГ-D2.1 (срез 14.2): люди компании-заказчика на фронте — зеркало ответов
 * `GET counterparties/:id/contacts` и `GET counterparties/:id/employees`.
 */

export type ContactStatus = 'active' | 'archived';
export type EmployeeStatus = 'active' | 'inactive' | 'dismissed';

export interface ClientContact {
  id: string;
  counterpartyId: string;
  firstName: string;
  lastName?: string;
  position?: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
  status: ContactStatus;
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientEmployee {
  id: string;
  counterpartyId: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  position?: string;
  email?: string;
  phone?: string;
  employeeNo?: string;
  status: EmployeeStatus;
  learnerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientEmployeesPage {
  items: ClientEmployee[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ClientEmployeesFilters {
  q?: string;
  status?: EmployeeStatus;
  page?: number;
  pageSize?: number;
}

export interface ContactPayload {
  firstName?: string;
  lastName?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  status?: ContactStatus;
}

export interface EmployeePayload {
  lastName?: string;
  firstName?: string;
  middleName?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  employeeNo?: string | null;
  status?: EmployeeStatus;
}

/** Итог «Пригласить в портал»: письмо ушло / почта стенда выключена / недавно уже слали. */
export interface RepresentativeInviteOutcome {
  status: 'sent' | 'throttled' | 'logged';
  userId: string;
  contact: ClientContact;
}

export interface EmployeesBulkRowInput {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  position?: string;
  email?: string;
  phone?: string;
  employeeNo?: string;
}

export interface EmployeesBulkOutcome {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  rows: Array<{
    rowNumber: number;
    status: 'created' | 'skipped' | 'failed';
    employeeId?: string;
    fullName?: string;
    reason?: string;
  }>;
}
