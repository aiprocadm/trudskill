import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';

import {
  COUNTERPARTY_PEOPLE_REPOSITORY,
  type CounterpartyPeopleRepository,
  personKey
} from './counterparty-people.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { resolveCounterpartyScope, scopeAllows } from '../counterparty-scope.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';

import type {
  BulkCounterpartyEmployeesRequest,
  CreateCounterpartyContactRequest,
  CreateCounterpartyEmployeeRequest,
  ListCounterpartyEmployeesQuery,
  UpdateCounterpartyContactRequest,
  UpdateCounterpartyEmployeeRequest
} from './counterparty-people.dto.js';
import type {
  CounterpartyContact,
  CounterpartyEmployee,
  EmployeesBulkOutcome,
  EmployeesBulkRow,
  EmployeesPage
} from './counterparty-people.types.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { Counterparty } from '../mvp.types.js';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PAGE_SIZE = 50;

const newId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

/** Пустая строка после обрезки — «нет значения». */
const clean = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Правка необязательного поля: нет в теле — не трогать, `null`/пусто — очистить. */
function patchOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: string | null | undefined
): void {
  if (value === undefined) return;
  const next = clean(value);
  if (next === undefined) delete target[key];
  else (target as Record<K, unknown>)[key] = next;
}

const fullName = (e: { lastName: string; firstName: string; middleName?: string }): string =>
  [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');

/**
 * Контакты и сотрудники компании (МГ-D2.1, срез 14.1).
 *
 * Компания берётся из снимка центра — там источник правды и скоуп представителя: чужая
 * компания для представителя — «не найдено», как в `GET counterparties/:id`.
 */
@Injectable()
export class CounterpartyPeopleService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(COUNTERPARTY_PEOPLE_REPOSITORY) private readonly repo: CounterpartyPeopleRepository,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async listContacts(
    tenantId: string,
    counterpartyId: string,
    ctx: RequestContext
  ): Promise<{ items: CounterpartyContact[] }> {
    this.requireCounterparty(tenantId, counterpartyId, ctx);
    return { items: await this.repo.listContacts(tenantId, counterpartyId) };
  }

  async createContact(
    tenantId: string,
    counterpartyId: string,
    body: CreateCounterpartyContactRequest,
    ctx: RequestContext
  ): Promise<CounterpartyContact> {
    const counterparty = this.requireCounterparty(tenantId, counterpartyId, ctx);
    const now = new Date().toISOString();
    const contact: CounterpartyContact = {
      id: newId('cc'),
      tenantId,
      counterpartyId,
      firstName: body.firstName.trim(),
      isPrimary: body.isPrimary ?? false,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    patchOptional(contact, 'lastName', body.lastName);
    patchOptional(contact, 'position', body.position);
    patchOptional(contact, 'email', body.email);
    patchOptional(contact, 'phone', body.phone);
    await this.repo.saveContact(tenantId, counterparty, contact);
    this.write(ctx, 'crm.counterparty_contact_created', 'crm.counterparty_contact', contact.id, {
      ...contact
    });
    return contact;
  }

  async updateContact(
    tenantId: string,
    counterpartyId: string,
    contactId: string,
    body: UpdateCounterpartyContactRequest,
    ctx: RequestContext
  ): Promise<CounterpartyContact> {
    const counterparty = this.requireCounterparty(tenantId, counterpartyId, ctx);
    const current = await this.repo.getContact(tenantId, counterpartyId, contactId);
    if (!current) {
      throw new NotFoundException({ code: 'not_found', message: 'Контакт не найден' });
    }
    const next: CounterpartyContact = { ...current, updatedAt: new Date().toISOString() };
    if (body.firstName !== undefined) next.firstName = body.firstName.trim();
    patchOptional(next, 'lastName', body.lastName);
    patchOptional(next, 'position', body.position);
    patchOptional(next, 'email', body.email);
    patchOptional(next, 'phone', body.phone);
    if (body.status !== undefined) next.status = body.status;
    if (body.isPrimary !== undefined) next.isPrimary = body.isPrimary;
    // Контакт в архиве основным быть не может: иначе «основной» указывал бы на ушедшего.
    if (next.status === 'archived') next.isPrimary = false;
    await this.repo.saveContact(tenantId, counterparty, next);
    this.write(
      ctx,
      'crm.counterparty_contact_updated',
      'crm.counterparty_contact',
      contactId,
      { ...next },
      current
    );
    return next;
  }

  async listEmployees(
    tenantId: string,
    counterpartyId: string,
    query: ListCounterpartyEmployeesQuery,
    ctx: RequestContext
  ): Promise<EmployeesPage> {
    this.requireCounterparty(tenantId, counterpartyId, ctx);
    return this.repo.listEmployees(tenantId, counterpartyId, {
      ...(query.q ? { q: query.q } : {}),
      ...(query.status ? { status: query.status } : {}),
      page: query.page ?? 1,
      pageSize: query.page_size ?? DEFAULT_PAGE_SIZE
    });
  }

  async createEmployee(
    tenantId: string,
    counterpartyId: string,
    body: CreateCounterpartyEmployeeRequest,
    ctx: RequestContext
  ): Promise<CounterpartyEmployee> {
    const counterparty = this.requireCounterparty(tenantId, counterpartyId, ctx);
    const employeeNo = clean(body.employeeNo);
    if (employeeNo) await this.assertEmployeeNoFree(tenantId, counterpartyId, employeeNo);
    const now = new Date().toISOString();
    const employee: CounterpartyEmployee = {
      id: newId('ce'),
      tenantId,
      counterpartyId,
      lastName: body.lastName.trim(),
      firstName: body.firstName.trim(),
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    patchOptional(employee, 'middleName', body.middleName);
    patchOptional(employee, 'position', body.position);
    patchOptional(employee, 'email', body.email);
    patchOptional(employee, 'phone', body.phone);
    patchOptional(employee, 'employeeNo', employeeNo);
    await this.repo.saveEmployees(tenantId, counterparty, [employee]);
    this.write(ctx, 'crm.counterparty_employee_created', 'crm.counterparty_employee', employee.id, {
      ...employee
    });
    return employee;
  }

  async updateEmployee(
    tenantId: string,
    counterpartyId: string,
    employeeId: string,
    body: UpdateCounterpartyEmployeeRequest,
    ctx: RequestContext
  ): Promise<CounterpartyEmployee> {
    const counterparty = this.requireCounterparty(tenantId, counterpartyId, ctx);
    const current = await this.repo.getEmployee(tenantId, counterpartyId, employeeId);
    if (!current) {
      throw new NotFoundException({ code: 'not_found', message: 'Сотрудник не найден' });
    }
    const next: CounterpartyEmployee = { ...current, updatedAt: new Date().toISOString() };
    if (body.lastName !== undefined) next.lastName = body.lastName.trim();
    if (body.firstName !== undefined) next.firstName = body.firstName.trim();
    patchOptional(next, 'middleName', body.middleName);
    patchOptional(next, 'position', body.position);
    patchOptional(next, 'email', body.email);
    patchOptional(next, 'phone', body.phone);
    if (body.employeeNo !== undefined) {
      const employeeNo = clean(body.employeeNo);
      if (employeeNo && employeeNo !== current.employeeNo) {
        await this.assertEmployeeNoFree(tenantId, counterpartyId, employeeNo);
      }
      patchOptional(next, 'employeeNo', employeeNo ?? null);
    }
    if (body.status !== undefined) next.status = body.status;

    const learnerChange =
      body.learnerId === undefined
        ? undefined
        : await this.resolveLearnerLink(tenantId, counterpartyId, current, body.learnerId);
    if (learnerChange) {
      if (learnerChange.learnerId) next.learnerId = learnerChange.learnerId;
      else delete next.learnerId;
    }

    // Сначала строка сотрудника: проекция слушателя в конце запроса ссылается на неё ключом.
    await this.repo.saveEmployees(tenantId, counterparty, [next]);
    if (learnerChange) this.applyLearnerLink(tenantId, counterpartyId, current, next);
    this.write(
      ctx,
      'crm.counterparty_employee_updated',
      'crm.counterparty_employee',
      employeeId,
      { ...next },
      current
    );
    return next;
  }

  /**
   * Массовое добавление (вставка списком): частичный успех. Строка без фамилии или имени,
   * с кривой почтой — «не добавлен» с причиной; тот же человек у компании уже работает или
   * повторён в списке — «пропущен» (РМ117); остальные заводятся одной записью.
   */
  async bulkEmployees(
    tenantId: string,
    counterpartyId: string,
    body: BulkCounterpartyEmployeesRequest,
    ctx: RequestContext
  ): Promise<EmployeesBulkOutcome> {
    const counterparty = this.requireCounterparty(tenantId, counterpartyId, ctx);
    const existing = await this.repo.activeEmployeeKeys(tenantId, counterpartyId);
    const seenPeople = new Set(existing.map((e) => personKey(e)));
    const seenNumbers = new Set(existing.map((e) => e.employeeNo).filter(Boolean) as string[]);
    const now = new Date().toISOString();
    const rows: EmployeesBulkRow[] = [];
    const accepted: CounterpartyEmployee[] = [];

    body.rows.forEach((raw, index) => {
      const rowNumber = index + 1;
      const lastName = clean(raw.lastName);
      const firstName = clean(raw.firstName);
      const email = clean(raw.email);
      const employeeNo = clean(raw.employeeNo);
      const name = [lastName, firstName, clean(raw.middleName)].filter(Boolean).join(' ');
      const label = name ? { fullName: name } : {};
      if (!lastName || !firstName) {
        rows.push({ rowNumber, status: 'failed', ...label, reason: 'Нужны фамилия и имя.' });
        return;
      }
      if (email && !EMAIL_FORMAT.test(email)) {
        rows.push({
          rowNumber,
          status: 'failed',
          ...label,
          reason: `Почта «${email}» не похожа на адрес.`
        });
        return;
      }
      const employee: CounterpartyEmployee = {
        id: newId('ce'),
        tenantId,
        counterpartyId,
        lastName,
        firstName,
        status: 'active',
        createdAt: now,
        updatedAt: now
      };
      patchOptional(employee, 'middleName', raw.middleName);
      patchOptional(employee, 'position', raw.position);
      patchOptional(employee, 'email', email);
      patchOptional(employee, 'phone', raw.phone);
      patchOptional(employee, 'employeeNo', employeeNo);
      const key = personKey(employee);
      if (seenPeople.has(key)) {
        rows.push({
          rowNumber,
          status: 'skipped',
          ...label,
          reason: 'Уже есть среди сотрудников компании.'
        });
        return;
      }
      if (employeeNo && seenNumbers.has(employeeNo)) {
        rows.push({
          rowNumber,
          status: 'skipped',
          ...label,
          reason: `Табельный номер ${employeeNo} уже занят.`
        });
        return;
      }
      seenPeople.add(key);
      if (employeeNo) seenNumbers.add(employeeNo);
      accepted.push(employee);
      rows.push({
        rowNumber,
        status: 'created',
        employeeId: employee.id,
        fullName: fullName(employee)
      });
    });

    await this.repo.saveEmployees(tenantId, counterparty, accepted);
    const outcome: EmployeesBulkOutcome = {
      total: rows.length,
      created: rows.filter((r) => r.status === 'created').length,
      skipped: rows.filter((r) => r.status === 'skipped').length,
      failed: rows.filter((r) => r.status === 'failed').length,
      rows
    };
    if (accepted.length > 0) {
      this.write(ctx, 'crm.counterparty_employees_bulk_added', 'crm.counterparty', counterpartyId, {
        created: outcome.created,
        skipped: outcome.skipped,
        failed: outcome.failed
      });
    }
    return outcome;
  }

  /** Компания из снимка центра с проверкой скоупа представителя: чужая — «не найдено». */
  requireCounterparty(tenantId: string, counterpartyId: string, ctx: RequestContext): Counterparty {
    const counterparty = this.state.counterparties.find(
      (c) => c.tenantId === tenantId && c.id === counterpartyId
    );
    const scope = resolveCounterpartyScope({ counterpartyId: ctx.counterpartyId ?? null });
    if (!counterparty || !scopeAllows(scope, counterparty.id)) {
      throw new NotFoundException({ code: 'not_found', message: 'Компания не найдена' });
    }
    return counterparty;
  }

  private async assertEmployeeNoFree(
    tenantId: string,
    counterpartyId: string,
    employeeNo: string
  ): Promise<void> {
    const taken = await this.repo.findEmployeeByNumber(tenantId, counterpartyId, employeeNo);
    if (taken) {
      throw new ConflictException({
        code: 'employee_no_taken',
        message: `Табельный номер ${employeeNo} уже у сотрудника ${fullName(taken)}.`
      });
    }
  }

  /**
   * Связь «сотрудник → слушатель» (РМ118): слушатель — этого центра; если у него уже есть
   * компания, то эта же; один слушатель — один сотрудник.
   */
  private async resolveLearnerLink(
    tenantId: string,
    counterpartyId: string,
    current: CounterpartyEmployee,
    learnerId: string | null
  ): Promise<{ learnerId?: string }> {
    if (learnerId === null) return {};
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) {
      throw new NotFoundException({ code: 'learner_not_found', message: 'Слушатель не найден' });
    }
    if (learner.counterpartyId && learner.counterpartyId !== counterpartyId) {
      throw new BadRequestException({
        code: 'employee_learner_other_company',
        message: 'Слушатель числится в другой компании.'
      });
    }
    const linked = await this.repo.findEmployeeByLearner(tenantId, learnerId);
    if (linked && linked.id !== current.id) {
      throw new ConflictException({
        code: 'learner_already_linked',
        message: `Слушатель уже связан с сотрудником ${fullName(linked)}.`
      });
    }
    return { learnerId };
  }

  /** Связь в снимке: прежний слушатель отвязывается, новый получает сотрудника и компанию. */
  private applyLearnerLink(
    tenantId: string,
    counterpartyId: string,
    before: CounterpartyEmployee,
    after: CounterpartyEmployee
  ): void {
    const now = new Date().toISOString();
    if (before.learnerId && before.learnerId !== after.learnerId) {
      const previous = this.state.learners.find(
        (l) => l.tenantId === tenantId && l.id === before.learnerId
      );
      if (previous?.counterpartyEmployeeId === before.id) {
        delete previous.counterpartyEmployeeId;
        previous.updatedAt = now;
      }
    }
    if (after.learnerId) {
      const learner = this.state.learners.find(
        (l) => l.tenantId === tenantId && l.id === after.learnerId
      );
      if (learner) {
        learner.counterpartyEmployeeId = after.id;
        if (!learner.counterpartyId) learner.counterpartyId = counterpartyId;
        learner.updatedAt = now;
      }
    }
  }

  private write(
    ctx: RequestContext,
    action: string,
    entityType: string,
    entityId: string,
    newValues: Record<string, unknown>,
    oldValues?: object
  ): void {
    this.audit.write({
      tenantId: ctx.tenantId!,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      action,
      entityType,
      entityId,
      ...(oldValues ? { oldValues: oldValues as Record<string, unknown> } : {}),
      newValues,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
  }
}
