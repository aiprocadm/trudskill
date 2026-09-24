import type {
  CounterpartyContact,
  CounterpartyEmployee,
  EmployeesPage,
  EmployeesQuery
} from './counterparty-people.types.js';
import type { Counterparty } from '../mvp.types.js';

/**
 * Хранилище людей компании (МГ-D2.1, срез 14.1).
 *
 * Запись принимает компанию целиком, а не её идентификатор: Postgres-реализация в той же
 * транзакции досоздаёт строку `crm.counterparties`, если проекция снимка её ещё не положила
 * (РМ116), — иначе внешний ключ 0003 отверг бы запись о человеке существующей компании.
 */
export interface CounterpartyPeopleRepository {
  listContacts(tenantId: string, counterpartyId: string): Promise<CounterpartyContact[]>;
  getContact(
    tenantId: string,
    counterpartyId: string,
    contactId: string
  ): Promise<CounterpartyContact | null>;
  /** Вставка или правка; основной контакт у компании один — прежний основной снимается. */
  saveContact(
    tenantId: string,
    counterparty: Counterparty,
    contact: CounterpartyContact
  ): Promise<void>;

  listEmployees(
    tenantId: string,
    counterpartyId: string,
    query: EmployeesQuery
  ): Promise<EmployeesPage>;
  getEmployee(
    tenantId: string,
    counterpartyId: string,
    employeeId: string
  ): Promise<CounterpartyEmployee | null>;
  findEmployeeByLearner(tenantId: string, learnerId: string): Promise<CounterpartyEmployee | null>;
  findEmployeeByNumber(
    tenantId: string,
    counterpartyId: string,
    employeeNo: string
  ): Promise<CounterpartyEmployee | null>;
  /** ФИО и табельные номера работающих — для поиска дублей при массовом добавлении. */
  activeEmployeeKeys(
    tenantId: string,
    counterpartyId: string
  ): Promise<
    Array<Pick<CounterpartyEmployee, 'lastName' | 'firstName' | 'middleName' | 'employeeNo'>>
  >;
  /** Строка компании в `crm.counterparties` — до ссылок на неё извне (`iam.users`, 0071). */
  ensureCounterparty(tenantId: string, counterparty: Counterparty): Promise<void>;
  /** Вставка или правка пачкой — одной транзакцией. */
  saveEmployees(
    tenantId: string,
    counterparty: Counterparty,
    employees: CounterpartyEmployee[]
  ): Promise<void>;
}

export const COUNTERPARTY_PEOPLE_REPOSITORY = Symbol('COUNTERPARTY_PEOPLE_REPOSITORY');

/** Ключ человека для поиска дублей: регистр, «ё/е» и лишние пробелы не различают людей. */
export function personKey(person: {
  lastName: string;
  firstName: string;
  middleName?: string | undefined;
}): string {
  return [person.lastName, person.firstName, person.middleName ?? '']
    .map((part) => part.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '))
    .join('|');
}
