import type { CounterpartyPeopleRepository } from './counterparty-people.repository.js';
import type {
  CounterpartyContact,
  CounterpartyEmployee,
  EmployeesPage,
  EmployeesQuery
} from './counterparty-people.types.js';
import type { Counterparty } from '../mvp.types.js';

const byName = (a: CounterpartyEmployee, b: CounterpartyEmployee): number =>
  a.lastName.localeCompare(b.lastName, 'ru') ||
  a.firstName.localeCompare(b.firstName, 'ru') ||
  a.id.localeCompare(b.id);

/** Память — режим `ALLOW_IN_MEMORY_STATE` (разработка) и тесты службы. */
export class InMemoryCounterpartyPeopleRepository implements CounterpartyPeopleRepository {
  private readonly contacts = new Map<string, CounterpartyContact>();
  private readonly employees = new Map<string, CounterpartyEmployee>();

  async listContacts(tenantId: string, counterpartyId: string): Promise<CounterpartyContact[]> {
    return [...this.contacts.values()]
      .filter((c) => c.tenantId === tenantId && c.counterpartyId === counterpartyId)
      .sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          (a.lastName ?? '').localeCompare(b.lastName ?? '', 'ru') ||
          a.firstName.localeCompare(b.firstName, 'ru') ||
          a.id.localeCompare(b.id)
      )
      .map((c) => ({ ...c }));
  }

  async getContact(
    tenantId: string,
    counterpartyId: string,
    contactId: string
  ): Promise<CounterpartyContact | null> {
    const found = this.contacts.get(contactId);
    return found && found.tenantId === tenantId && found.counterpartyId === counterpartyId
      ? { ...found }
      : null;
  }

  async saveContact(
    tenantId: string,
    counterparty: Counterparty,
    contact: CounterpartyContact
  ): Promise<void> {
    if (contact.isPrimary) {
      for (const other of this.contacts.values()) {
        if (
          other.tenantId === tenantId &&
          other.counterpartyId === counterparty.id &&
          other.id !== contact.id
        ) {
          other.isPrimary = false;
        }
      }
    }
    this.contacts.set(contact.id, { ...contact, tenantId, counterpartyId: counterparty.id });
  }

  async listEmployees(
    tenantId: string,
    counterpartyId: string,
    query: EmployeesQuery
  ): Promise<EmployeesPage> {
    const needle = query.q?.trim().toLowerCase();
    const all = [...this.employees.values()]
      .filter((e) => e.tenantId === tenantId && e.counterpartyId === counterpartyId)
      .filter((e) => !query.status || e.status === query.status)
      .filter(
        (e) =>
          !needle ||
          [e.lastName, e.firstName, e.middleName, e.position, e.email, e.employeeNo]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle))
      )
      .sort(byName);
    const start = (query.page - 1) * query.pageSize;
    return {
      items: all.slice(start, start + query.pageSize).map((e) => ({ ...e })),
      total: all.length,
      page: query.page,
      pageSize: query.pageSize
    };
  }

  async getEmployee(
    tenantId: string,
    counterpartyId: string,
    employeeId: string
  ): Promise<CounterpartyEmployee | null> {
    const found = this.employees.get(employeeId);
    return found && found.tenantId === tenantId && found.counterpartyId === counterpartyId
      ? { ...found }
      : null;
  }

  async findEmployeeByLearner(
    tenantId: string,
    learnerId: string
  ): Promise<CounterpartyEmployee | null> {
    const found = [...this.employees.values()].find(
      (e) => e.tenantId === tenantId && e.learnerId === learnerId
    );
    return found ? { ...found } : null;
  }

  async findEmployeeByNumber(
    tenantId: string,
    counterpartyId: string,
    employeeNo: string
  ): Promise<CounterpartyEmployee | null> {
    const found = [...this.employees.values()].find(
      (e) =>
        e.tenantId === tenantId &&
        e.counterpartyId === counterpartyId &&
        e.employeeNo === employeeNo
    );
    return found ? { ...found } : null;
  }

  async activeEmployeeKeys(
    tenantId: string,
    counterpartyId: string
  ): Promise<
    Array<Pick<CounterpartyEmployee, 'lastName' | 'firstName' | 'middleName' | 'employeeNo'>>
  > {
    return [...this.employees.values()]
      .filter(
        (e) =>
          e.tenantId === tenantId && e.counterpartyId === counterpartyId && e.status === 'active'
      )
      .map((e) => ({
        lastName: e.lastName,
        firstName: e.firstName,
        ...(e.middleName ? { middleName: e.middleName } : {}),
        ...(e.employeeNo ? { employeeNo: e.employeeNo } : {})
      }));
  }

  async ensureCounterparty(): Promise<void> {
    /* В памяти внешних ключей нет — досоздавать нечего. */
  }

  async saveEmployees(
    tenantId: string,
    counterparty: Counterparty,
    employees: CounterpartyEmployee[]
  ): Promise<void> {
    for (const employee of employees) {
      this.employees.set(employee.id, { ...employee, tenantId, counterpartyId: counterparty.id });
    }
  }
}
