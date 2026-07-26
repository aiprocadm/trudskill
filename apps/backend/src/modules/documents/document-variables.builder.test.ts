import { describe, expect, it, vi } from 'vitest';

import { DocumentVariablesBuilder } from './document-variables.builder.js';
import { InMemoryMvpState } from '../mvp/infrastructure/in-memory-mvp.state.js';

import type { DocumentGenerationTaskEntity } from './documents.types.js';
import type { MvpTenantRunner } from '../mvp/infrastructure/mvp-tenant-runner.service.js';
import type { LicensesService } from '../org/licenses.service.js';
import type { TenantService } from '../tenant/tenant.service.js';

const T = 'tenant_demo';
const base = { tenantId: T, status: 'active' as const, createdAt: '', updatedAt: '' };

/** Полный срез: заказчик → группа → курс/версия → комиссия → два слушателя с записями. */
function seedState(): InMemoryMvpState {
  const state = new InMemoryMvpState();
  state.counterparties.push({
    ...base,
    id: 'cp1',
    code: 'CP-1',
    name: 'АО «Завод»',
    inn: '7712345678'
  } as never);
  state.groups.push({
    ...base,
    id: 'g1',
    code: 'G-1',
    name: 'ОТ-2026-03',
    counterpartyId: 'cp1'
  } as never);
  state.courses.push({
    ...base,
    id: 'c1',
    code: 'OT-40',
    title: 'Охрана труда, 40 часов',
    isArchived: false
  } as never);
  state.courseVersions.push({
    ...base,
    id: 'cv1',
    courseId: 'c1',
    versionNo: 1,
    academicHours: 40,
    trainingType: 'primary',
    commissionId: 'com1'
  } as never);
  state.groupCourses.push({
    ...base,
    id: 'gc1',
    groupId: 'g1',
    courseId: 'c1',
    courseVersionId: 'cv1',
    sortOrder: 1
  } as never);
  state.commissions.push({ ...base, id: 'com1', code: 'K-1', name: 'Комиссия по ОТ' } as never);
  state.commissionMembers.push({
    ...base,
    id: 'm1',
    commissionId: 'com1',
    role: 'chairman',
    externalFullName: 'Петров П. П.',
    externalPosition: 'Директор',
    positionInOrder: 1
  } as never);
  state.learners.push(
    {
      ...base,
      id: 'l1',
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Иванович',
      snils: '112-233-445 95',
      position: 'Инженер'
    } as never,
    { ...base, id: 'l2', firstName: 'Анна', lastName: 'Сидорова' } as never
  );
  state.enrollments.push(
    { ...base, id: 'e1', groupId: 'g1', learnerId: 'l1', enrolledAt: '2026-01-10' } as never,
    { ...base, id: 'e2', groupId: 'g1', learnerId: 'l2', enrolledAt: '2026-01-10' } as never
  );
  return state;
}

const task = {
  id: 'dtask_1',
  tenantId: T,
  templateId: 'tpl1',
  templateVersionId: 'tv1',
  documentType: 'certificate',
  taskType: 'generate',
  sourceEntityType: 'enrollment',
  sourceEntityId: 'e1',
  status: 'running',
  requestedAt: '2026-07-26T00:00:00.000Z'
} as DocumentGenerationTaskEntity;

function makeBuilder(options?: { withTenant?: boolean; state?: InMemoryMvpState }) {
  const state = options?.state ?? seedState();
  const runner = {
    runWithTenantState: vi.fn(async (_t: string, fn: (s: InMemoryMvpState) => Promise<unknown>) =>
      fn(state)
    )
  } as unknown as MvpTenantRunner;

  const tenants = options?.withTenant
    ? ({
        getTenantById: vi.fn(async () => ({
          id: T,
          code: 'DEMO',
          name: 'УЦ «Пример»',
          status: 'active'
        })),
        getRequisites: vi.fn(async () => ({
          tenantId: T,
          legalName: 'ООО «УЦ Пример»',
          taxNumber: '7701234567',
          payload: {}
        }))
      } as unknown as TenantService)
    : undefined;

  const licenses = options?.withTenant
    ? ({
        list: vi.fn(async () => [
          {
            id: 'lic',
            tenantId: T,
            licenseType: 'education_license',
            licenseNumber: 'Л035-00115',
            issuerName: 'Рособрнадзор',
            issuedAt: '2024-02-01',
            status: 'active',
            createdAt: '',
            updatedAt: ''
          }
        ])
      } as unknown as LicensesService)
    : undefined;

  return new DocumentVariablesBuilder(runner, tenants, licenses);
}

describe('DocumentVariablesBuilder (ФТ-A2.3)', () => {
  it('walks enrollment → learner / group / counterparty / course / commission', async () => {
    const vars = await makeBuilder().build({ tenantId: T, task, reservedNumber: '26-ОТ-0001' });

    expect(vars['learner.full_name']).toBe('Иванов Иван Иванович');
    expect(vars['learner.snils']).toBe('112-233-445 95');
    expect(vars['learner.position']).toBe('Инженер');
    expect(vars['group.name']).toBe('ОТ-2026-03');
    expect(vars['group.counterparty_name']).toBe('АО «Завод»');
    expect(vars['counterparty.inn']).toBe('7712345678');
    expect(vars['course.title']).toBe('Охрана труда, 40 часов');
    expect(vars['program.academic_hours']).toBe(40);
    expect(vars['commission.name']).toBe('Комиссия по ОТ');
    expect(vars['commission.chairman.name']).toBe('Петров П. П.');
    expect(vars['enrollment.start_date']).toBe('2026-01-10');
  });

  it('fills the protocol table with ALL learners of the group, not just the current one', async () => {
    const vars = await makeBuilder().build({ tenantId: T, task });
    const rows = vars['group_learners'] as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(vars['group_learners_count']).toBe(2);
  });

  it('resolves the document number and the date in words (ФТ-A2.3)', async () => {
    const vars = await makeBuilder().build({
      tenantId: T,
      task,
      reservedNumber: '26-ОТ-0042',
      document: {
        id: 'gdoc',
        documentNumber: '26-ОТ-0042',
        documentDate: '2026-07-26'
      } as never
    });
    expect(vars['document.number']).toBe('26-ОТ-0042');
    expect(vars['document.issue_date_words']).toBe('26 июля 2026 г.');
  });

  it('resolves tenant name, requisites and licence when the services are available', async () => {
    const vars = await makeBuilder({ withTenant: true }).build({ tenantId: T, task });
    expect(vars['tenant.name']).toBe('УЦ «Пример»');
    expect(vars['tenant.legal_name']).toBe('ООО «УЦ Пример»');
    expect(vars['tenant.license_number']).toBe('Л035-00115');
  });

  it('a task with an unknown source degrades to blanks instead of throwing', async () => {
    const vars = await makeBuilder().build({
      tenantId: T,
      task: { ...task, sourceEntityId: 'missing' } as DocumentGenerationTaskEntity
    });
    expect(vars['learner.full_name']).toBe('');
    expect(vars['group.name']).toBe('');
    // Документные переменные не зависят от MVP-состояния и остаются на месте.
    expect(vars['document.number']).toBeDefined();
  });

  it('the dictionary always has the same shape — every catalogued code is present', async () => {
    const vars = await makeBuilder().build({ tenantId: T, task });
    for (const code of ['tenant.name', 'learner.snils', 'commission.members', 'document.qr_url']) {
      expect(Object.hasOwn(vars, code)).toBe(true);
    }
  });

  it('an MVP state failure degrades to blanks instead of failing the whole issuance', async () => {
    const runner = {
      runWithTenantState: vi.fn(async () => {
        throw new Error('database is down');
      })
    } as unknown as MvpTenantRunner;
    const builder = new DocumentVariablesBuilder(runner);
    const vars = await builder.build({ tenantId: T, task, reservedNumber: 'N-1' });
    expect(vars['document.number']).toBe('N-1');
    // Ключ присутствует и пуст — форма словаря не зависит от доступности состояния.
    expect(vars['learner.full_name']).toBe('');
  });

  it('never leaks another tenant data (state is filtered by tenantId)', async () => {
    const state = seedState();
    state.learners.push({
      ...base,
      tenantId: 'tenant_other',
      id: 'l_other',
      firstName: 'Чужой',
      lastName: 'Слушатель'
    } as never);
    state.enrollments.push({
      ...base,
      tenantId: 'tenant_other',
      id: 'e_other',
      groupId: 'g1',
      learnerId: 'l_other',
      enrolledAt: '2026-01-10'
    } as never);

    const vars = await makeBuilder({ state }).build({ tenantId: T, task });
    const rows = vars['group_learners'] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain('Чужой');
  });
});
