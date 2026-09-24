import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import {
  TABLE_SPECS,
  emptyContext,
  projectEntity
} from '../../migration/backfill/normalized/normalized-projection.js';
import { upsertRows } from '../../migration/backfill/normalized/normalized-upsert.js';
import { likePattern } from '../infrastructure/repositories/registry-list-query.js';

import type { CounterpartyPeopleRepository } from './counterparty-people.repository.js';
import type {
  ContactStatus,
  CounterpartyContact,
  CounterpartyEmployee,
  EmployeeStatus,
  EmployeesPage,
  EmployeesQuery
} from './counterparty-people.types.js';
import type { Counterparty } from '../mvp.types.js';
import type { PoolClient } from 'pg';

interface ContactDbRow {
  id: string;
  tenant_id: string;
  counterparty_id: string;
  first_name: string;
  last_name: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  status: ContactStatus;
  user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface EmployeeDbRow {
  id: string;
  tenant_id: string;
  counterparty_id: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  employee_no: string | null;
  status: EmployeeStatus;
  learner_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : String(value);

const optional = <K extends string>(key: K, value: string | null): Partial<Record<K, string>> =>
  value ? ({ [key]: value } as Record<K, string>) : {};

const toContact = (row: ContactDbRow): CounterpartyContact => ({
  id: row.id,
  tenantId: row.tenant_id,
  counterpartyId: row.counterparty_id,
  firstName: row.first_name,
  ...optional('lastName', row.last_name),
  ...optional('position', row.position),
  ...optional('email', row.email),
  ...optional('phone', row.phone),
  isPrimary: row.is_primary,
  status: row.status,
  ...optional('userId', row.user_id),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at)
});

const toEmployee = (row: EmployeeDbRow): CounterpartyEmployee => ({
  id: row.id,
  tenantId: row.tenant_id,
  counterpartyId: row.counterparty_id,
  lastName: row.last_name,
  firstName: row.first_name,
  ...optional('middleName', row.middle_name),
  ...optional('position', row.position),
  ...optional('email', row.email),
  ...optional('phone', row.phone),
  ...optional('employeeNo', row.employee_no),
  status: row.status,
  ...optional('learnerId', row.learner_id),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at)
});

const CONTACT_COLUMNS =
  'id, tenant_id, counterparty_id, first_name, last_name, position, email, phone, is_primary, ' +
  'status, user_id, created_at, updated_at';

const EMPLOYEE_COLUMNS =
  'id, tenant_id, counterparty_id, last_name, first_name, middle_name, position, email, phone, ' +
  'employee_no, status, learner_id, created_at, updated_at';

/** Сколько сотрудников пишется одним `insert … values` — параметров меньше предела Postgres. */
const EMPLOYEES_CHUNK = 200;

/**
 * Люди компании в Postgres (МГ-D2.1, срез 14.1, РМ116). Каждый запрос — с `tenant_id = $1`;
 * запись идёт одной транзакцией вместе с досозданием строки компании.
 */
@Injectable()
export class PostgresCounterpartyPeopleRepository implements CounterpartyPeopleRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listContacts(tenantId: string, counterpartyId: string): Promise<CounterpartyContact[]> {
    const rows = await this.db.query<ContactDbRow>(
      `select ${CONTACT_COLUMNS} from crm.counterparty_contacts
       where tenant_id = $1 and counterparty_id = $2 and deleted_at is null
       order by is_primary desc, last_name asc nulls last, first_name asc, id asc`,
      [tenantId, counterpartyId]
    );
    return rows.map(toContact);
  }

  async getContact(
    tenantId: string,
    counterpartyId: string,
    contactId: string
  ): Promise<CounterpartyContact | null> {
    const rows = await this.db.query<ContactDbRow>(
      `select ${CONTACT_COLUMNS} from crm.counterparty_contacts
       where tenant_id = $1 and counterparty_id = $2 and id = $3 and deleted_at is null`,
      [tenantId, counterpartyId, contactId]
    );
    return rows[0] ? toContact(rows[0]) : null;
  }

  async saveContact(
    tenantId: string,
    counterparty: Counterparty,
    contact: CounterpartyContact
  ): Promise<void> {
    await this.db.withTransaction(async (client) => {
      await this.ensureCounterpartyRow(client, tenantId, counterparty);
      if (contact.isPrimary) {
        // Основной у компании один (индекс 0002): прежний снимается раньше, чем ставится новый.
        await this.db.query(
          `update crm.counterparty_contacts set is_primary = false, updated_at = now()
           where tenant_id = $1 and counterparty_id = $2 and id <> $3 and is_primary`,
          [tenantId, counterparty.id, contact.id],
          client
        );
      }
      const rows = await this.db.query<{ id: string }>(
        `insert into crm.counterparty_contacts
           (id, tenant_id, counterparty_id, first_name, last_name, position, email, phone,
            is_primary, status, user_id, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (id) do update set
           first_name = excluded.first_name, last_name = excluded.last_name,
           position = excluded.position, email = excluded.email, phone = excluded.phone,
           is_primary = excluded.is_primary, status = excluded.status, user_id = excluded.user_id,
           updated_at = excluded.updated_at
         where crm.counterparty_contacts.tenant_id = excluded.tenant_id
           and crm.counterparty_contacts.counterparty_id = excluded.counterparty_id
         returning id`,
        [
          contact.id,
          tenantId,
          counterparty.id,
          contact.firstName,
          contact.lastName ?? null,
          contact.position ?? null,
          contact.email ?? null,
          contact.phone ?? null,
          contact.isPrimary,
          contact.status,
          contact.userId ?? null,
          contact.createdAt,
          contact.updatedAt
        ],
        client
      );
      if (rows.length === 0) {
        throw new Error('crm.counterparty_contacts: идентификатор принадлежит другой компании');
      }
    });
  }

  async listEmployees(
    tenantId: string,
    counterpartyId: string,
    query: EmployeesQuery
  ): Promise<EmployeesPage> {
    const params: unknown[] = [tenantId, counterpartyId];
    const conditions: string[] = [];
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    if (query.q?.trim()) {
      params.push(likePattern(query.q.trim()));
      const p = `$${params.length}`;
      conditions.push(
        `(last_name ilike ${p} or first_name ilike ${p} or coalesce(middle_name, '') ilike ${p}` +
          ` or coalesce(position, '') ilike ${p} or coalesce(email, '') ilike ${p} or coalesce(employee_no, '') ilike ${p})`
      );
    }
    const extra = conditions.map((c) => ` and ${c}`).join('');
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from crm.counterparty_employees where tenant_id = $1 and counterparty_id = $2 and deleted_at is null${extra}`,
      params
    );
    const pageParams = [...params, query.pageSize, (query.page - 1) * query.pageSize];
    const rows = await this.db.query<EmployeeDbRow>(
      `select ${EMPLOYEE_COLUMNS} from crm.counterparty_employees where tenant_id = $1 and counterparty_id = $2 and deleted_at is null${extra}
       order by last_name asc, first_name asc, id asc
       limit $${pageParams.length - 1} offset $${pageParams.length}`,
      pageParams
    );
    return {
      items: rows.map(toEmployee),
      total: Number(totals[0]?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize
    };
  }

  async getEmployee(
    tenantId: string,
    counterpartyId: string,
    employeeId: string
  ): Promise<CounterpartyEmployee | null> {
    const rows = await this.db.query<EmployeeDbRow>(
      `select ${EMPLOYEE_COLUMNS} from crm.counterparty_employees
       where tenant_id = $1 and counterparty_id = $2 and id = $3 and deleted_at is null`,
      [tenantId, counterpartyId, employeeId]
    );
    return rows[0] ? toEmployee(rows[0]) : null;
  }

  async findEmployeeByLearner(
    tenantId: string,
    learnerId: string
  ): Promise<CounterpartyEmployee | null> {
    const rows = await this.db.query<EmployeeDbRow>(
      `select ${EMPLOYEE_COLUMNS} from crm.counterparty_employees
       where tenant_id = $1 and learner_id = $2 and deleted_at is null
       order by id asc limit 1`,
      [tenantId, learnerId]
    );
    return rows[0] ? toEmployee(rows[0]) : null;
  }

  async findEmployeeByNumber(
    tenantId: string,
    counterpartyId: string,
    employeeNo: string
  ): Promise<CounterpartyEmployee | null> {
    const rows = await this.db.query<EmployeeDbRow>(
      `select ${EMPLOYEE_COLUMNS} from crm.counterparty_employees
       where tenant_id = $1 and counterparty_id = $2 and employee_no = $3 and deleted_at is null
       order by id asc limit 1`,
      [tenantId, counterpartyId, employeeNo]
    );
    return rows[0] ? toEmployee(rows[0]) : null;
  }

  async activeEmployeeKeys(
    tenantId: string,
    counterpartyId: string
  ): Promise<
    Array<Pick<CounterpartyEmployee, 'lastName' | 'firstName' | 'middleName' | 'employeeNo'>>
  > {
    const rows = await this.db.query<{
      last_name: string;
      first_name: string;
      middle_name: string | null;
      employee_no: string | null;
    }>(
      `select last_name, first_name, middle_name, employee_no from crm.counterparty_employees
       where tenant_id = $1 and counterparty_id = $2 and deleted_at is null and status = 'active'`,
      [tenantId, counterpartyId]
    );
    return rows.map((row) => ({
      lastName: row.last_name,
      firstName: row.first_name,
      ...optional('middleName', row.middle_name),
      ...optional('employeeNo', row.employee_no)
    }));
  }

  async saveEmployees(
    tenantId: string,
    counterparty: Counterparty,
    employees: CounterpartyEmployee[]
  ): Promise<void> {
    if (employees.length === 0) return;
    await this.db.withTransaction(async (client) => {
      await this.ensureCounterpartyRow(client, tenantId, counterparty);
      for (let start = 0; start < employees.length; start += EMPLOYEES_CHUNK) {
        const chunk = employees.slice(start, start + EMPLOYEES_CHUNK);
        const params: unknown[] = [];
        const tuples = chunk.map((employee) => {
          const values = [
            employee.id,
            tenantId,
            counterparty.id,
            employee.lastName,
            employee.firstName,
            employee.middleName ?? null,
            employee.position ?? null,
            employee.email ?? null,
            employee.phone ?? null,
            employee.employeeNo ?? null,
            employee.status,
            employee.learnerId ?? null,
            employee.createdAt,
            employee.updatedAt
          ];
          const placeholders = values.map((value) => {
            params.push(value);
            return `$${params.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        const rows = await this.db.query<{ id: string }>(
          `insert into crm.counterparty_employees
             (id, tenant_id, counterparty_id, last_name, first_name, middle_name, position, email,
              phone, employee_no, status, learner_id, created_at, updated_at)
           values ${tuples.join(', ')}
           on conflict (id) do update set
             last_name = excluded.last_name, first_name = excluded.first_name,
             middle_name = excluded.middle_name, position = excluded.position,
             email = excluded.email, phone = excluded.phone, employee_no = excluded.employee_no,
             status = excluded.status, learner_id = excluded.learner_id,
             updated_at = excluded.updated_at
           where crm.counterparty_employees.tenant_id = excluded.tenant_id
             and crm.counterparty_employees.counterparty_id = excluded.counterparty_id
           returning id`,
          params,
          client
        );
        if (rows.length < chunk.length) {
          throw new Error('crm.counterparty_employees: идентификатор принадлежит другой компании');
        }
      }
    });
  }

  async ensureCounterparty(tenantId: string, counterparty: Counterparty): Promise<void> {
    await this.db.withTransaction((client) =>
      this.ensureCounterpartyRow(client, tenantId, counterparty)
    );
  }

  /**
   * Строка компании в `crm.counterparties` обязана быть до записи человека (внешний ключ 0003),
   * а проекция снимка её не гарантирует: пишет только изменённые, сбой глотает (РМ116). Если
   * строки нет — кладётся та же проекция, что пишет снимок, в этой же транзакции.
   */
  private async ensureCounterpartyRow(
    client: PoolClient,
    tenantId: string,
    counterparty: Counterparty
  ): Promise<void> {
    const found = await this.db.query<{ id: string }>(
      `select id from crm.counterparties where tenant_id = $1 and id = $2`,
      [tenantId, counterparty.id],
      client
    );
    if (found.length > 0) return;
    const row = projectEntity(
      'counterparties',
      tenantId,
      counterparty as unknown as Record<string, unknown>,
      emptyContext()
    );
    await upsertRows(client, TABLE_SPECS.counterparties, [row]);
  }
}
