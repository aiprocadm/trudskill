import type {
  ClientContact,
  ClientEmployee,
  ContactStatus,
  EmployeeStatus,
  EmployeesBulkOutcome,
  EmployeesBulkRowInput
} from './people-types';
import type { BulkOutcome } from '@trudskill/ui';

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  active: 'действует',
  archived: 'в архиве'
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: 'работает',
  inactive: 'не работает',
  dismissed: 'уволен'
};

export const contactName = (c: Pick<ClientContact, 'lastName' | 'firstName'>): string =>
  [c.lastName, c.firstName].filter(Boolean).join(' ');

export const employeeName = (
  e: Pick<ClientEmployee, 'lastName' | 'firstName' | 'middleName'>
): string => [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');

/**
 * Вставка сотрудников списком (МГ-D2.1): одна строка — один человек, поля через «;» или
 * табуляцию: ФИО; должность; почта; телефон; табельный номер. ФИО — по-русски «Фамилия Имя
 * Отчество»: первое слово — фамилия, второе — имя, остальное — отчество. Проверки (есть ли
 * имя, похожа ли почта на почту, нет ли человека уже) делает сервер — построчно, с причиной.
 */
export function parseEmployeesPaste(text: string): EmployeesBulkRowInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [fio = '', position = '', email = '', phone = '', employeeNo = ''] = line
        .split(/;|\t/)
        .map((part) => part.trim());
      const [lastName = '', firstName = '', ...rest] = fio.split(/\s+/).filter(Boolean);
      const middleName = rest.join(' ');
      const row: EmployeesBulkRowInput = {};
      if (lastName) row.lastName = lastName;
      if (firstName) row.firstName = firstName;
      if (middleName) row.middleName = middleName;
      if (position) row.position = position;
      if (email) row.email = email;
      if (phone) row.phone = phone;
      if (employeeNo) row.employeeNo = employeeNo;
      return row;
    });
}

/** Итог вставки для `OperationOutcome`: заведённые — успех, пропущенные и отказы — поимённо. */
export function employeesBulkSummary(outcome: EmployeesBulkOutcome): BulkOutcome {
  return {
    total: outcome.total,
    succeeded: outcome.created,
    failures: outcome.rows
      .filter((row) => row.status !== 'created')
      .map((row) => ({
        label: `Строка ${row.rowNumber}${row.fullName ? `: ${row.fullName}` : ''}`,
        reason:
          row.status === 'skipped'
            ? `пропущен — ${row.reason ?? 'уже есть'}`
            : (row.reason ?? 'не добавлен')
      }))
  };
}
