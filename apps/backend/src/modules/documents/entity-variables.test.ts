import { describe, expect, it } from 'vitest';

import {
  formatLearnerInitials,
  resolveCounterpartyVariables,
  resolveCourseVariables,
  resolveGroupVariables,
  resolveLearnerVariables,
  resolveTenantVariables
} from './entity-variables.js';

import type { Counterparty, Course, GroupEntity, Learner } from '../mvp/mvp.types.js';
import type { TrainingLicense } from '../org/licenses.types.js';
import type { Tenant, TenantRequisites } from '../tenant/tenant.types.js';

const base = { tenantId: 'tenant_demo', status: 'active' as const, createdAt: '', updatedAt: '' };

const learner: Learner = {
  ...base,
  id: 'l1',
  learnerNo: 'L-001',
  firstName: 'Иван',
  lastName: 'Иванов',
  middleName: 'Иванович',
  email: 'ivanov@example.ru',
  snils: '112-233-445 95',
  position: 'Инженер по охране труда',
  dateOfBirth: '1985-03-05'
} as Learner;

const tenant: Tenant = { id: 'tenant_demo', code: 'DEMO', name: 'УЦ «Пример»', status: 'active' };
const requisites: TenantRequisites = {
  tenantId: 'tenant_demo',
  legalName: 'ООО «Учебный центр Пример»',
  taxNumber: '7701234567',
  payload: {}
};

const license = (over: Partial<TrainingLicense>): TrainingLicense =>
  ({
    id: 'lic',
    tenantId: 'tenant_demo',
    licenseType: 'education_license',
    licenseNumber: 'Л035-00115-77/00123456',
    issuerName: 'Рособрнадзор',
    issuedAt: '2024-02-01',
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...over
  }) as TrainingLicense;

describe('resolveTenantVariables (ФТ-A2.3)', () => {
  it('resolves name, requisites and the active education license', () => {
    const r = resolveTenantVariables({ tenant, requisites, licenses: [license({})] }, [
      'tenant.name',
      'tenant.legal_name',
      'tenant.tax_number',
      'tenant.license_number',
      'tenant.license_issuer',
      'tenant.license_issued_at_words'
    ]);
    expect(r['tenant.name']).toBe('УЦ «Пример»');
    expect(r['tenant.legal_name']).toBe('ООО «Учебный центр Пример»');
    expect(r['tenant.tax_number']).toBe('7701234567');
    expect(r['tenant.license_number']).toBe('Л035-00115-77/00123456');
    expect(r['tenant.license_issuer']).toBe('Рособрнадзор');
    expect(r['tenant.license_issued_at_words']).toBe('1 февраля 2024 г.');
  });

  it('picks accreditation separately from the education license', () => {
    const r = resolveTenantVariables(
      {
        tenant,
        licenses: [
          license({}),
          license({ id: 'a1', licenseType: 'accreditation', licenseNumber: 'АКК-777' })
        ]
      },
      ['tenant.license_number', 'tenant.accreditation_number']
    );
    expect(r['tenant.license_number']).toBe('Л035-00115-77/00123456');
    expect(r['tenant.accreditation_number']).toBe('АКК-777');
  });

  it('ignores revoked/expired licenses and prefers the freshest active one', () => {
    const r = resolveTenantVariables(
      {
        tenant,
        licenses: [
          license({ id: 'old', licenseNumber: 'СТАРАЯ', issuedAt: '2020-01-01' }),
          license({
            id: 'rev',
            licenseNumber: 'ОТОЗВАНА',
            status: 'revoked',
            issuedAt: '2030-01-01'
          }),
          license({ id: 'new', licenseNumber: 'НОВАЯ', issuedAt: '2025-06-01' })
        ]
      },
      ['tenant.license_number']
    );
    expect(r['tenant.license_number']).toBe('НОВАЯ');
  });

  it('missing requisites/licenses and unknown keys resolve to empty strings', () => {
    const r = resolveTenantVariables({ tenant }, [
      'tenant.legal_name',
      'tenant.license_number',
      'tenant.unknown_key',
      'learner.full_name'
    ]);
    expect(r['tenant.legal_name']).toBe('');
    expect(r['tenant.license_number']).toBe('');
    expect(r['tenant.unknown_key']).toBe('');
    expect(r['learner.full_name']).toBe('');
  });
});

describe('resolveLearnerVariables (ФТ-A2.3)', () => {
  it('resolves the full name, SNILS, position and dates', () => {
    const r = resolveLearnerVariables({ learner }, [
      'learner.full_name',
      'learner.snils',
      'learner.position',
      'learner.birth_date',
      'learner.birth_date_words',
      'learner.learner_no'
    ]);
    expect(r['learner.full_name']).toBe('Иванов Иван Иванович');
    expect(r['learner.snils']).toBe('112-233-445 95');
    expect(r['learner.position']).toBe('Инженер по охране труда');
    expect(r['learner.birth_date']).toBe('1985-03-05');
    expect(r['learner.birth_date_words']).toBe('5 марта 1985 г.');
    expect(r['learner.learner_no']).toBe('L-001');
  });

  it('builds initials for protocols and public verification (ФТ-A6.1)', () => {
    expect(formatLearnerInitials(learner)).toBe('Иванов И. И.');
    expect(formatLearnerInitials({ ...learner, middleName: undefined } as Learner)).toBe(
      'Иванов И.'
    );
    expect(
      formatLearnerInitials({ ...learner, firstName: '', middleName: undefined } as Learner)
    ).toBe('Иванов');
  });

  it('skips missing name parts instead of leaving double spaces', () => {
    const r = resolveLearnerVariables(
      { learner: { ...learner, middleName: undefined } as Learner },
      ['learner.full_name', 'learner.middle_name']
    );
    expect(r['learner.full_name']).toBe('Иванов Иван');
    expect(r['learner.middle_name']).toBe('');
  });
});

describe('resolveCounterpartyVariables / group / course (ФТ-A2.3)', () => {
  const counterparty = {
    ...base,
    id: 'cp1',
    code: 'CP-1',
    name: 'АО «Завод»',
    legalName: 'Акционерное общество «Завод»',
    inn: '7712345678',
    kpp: '771201001',
    legalAddress: 'г. Москва, ул. Заводская, 1'
  } as Counterparty;

  it('resolves counterparty requisites', () => {
    const r = resolveCounterpartyVariables({ counterparty }, [
      'counterparty.name',
      'counterparty.inn',
      'counterparty.kpp',
      'counterparty.legal_address'
    ]);
    expect(r['counterparty.name']).toBe('АО «Завод»');
    expect(r['counterparty.inn']).toBe('7712345678');
    expect(r['counterparty.kpp']).toBe('771201001');
    expect(r['counterparty.legal_address']).toBe('г. Москва, ул. Заводская, 1');
  });

  it('resolves group with its counterparty name', () => {
    const group = { ...base, id: 'g1', code: 'G-1', name: 'ОТ-2026-03' } as GroupEntity;
    const r = resolveGroupVariables({ group, counterparty }, [
      'group.code',
      'group.name',
      'group.counterparty_name'
    ]);
    expect(r['group.code']).toBe('G-1');
    expect(r['group.name']).toBe('ОТ-2026-03');
    expect(r['group.counterparty_name']).toBe('АО «Завод»');
  });

  it('resolves course fields', () => {
    const course = {
      ...base,
      id: 'c1',
      code: 'OT-40',
      title: 'Охрана труда, 40 часов',
      isArchived: false
    } as Course;
    const r = resolveCourseVariables({ course }, ['course.code', 'course.title']);
    expect(r['course.code']).toBe('OT-40');
    expect(r['course.title']).toBe('Охрана труда, 40 часов');
  });

  it('absent entities resolve to empty strings, never to "undefined"', () => {
    const r = {
      ...resolveGroupVariables({}, ['group.name', 'group.counterparty_name']),
      ...resolveCourseVariables({}, ['course.title']),
      ...resolveCounterpartyVariables({}, ['counterparty.name'])
    };
    expect(Object.values(r).every((value) => value === '')).toBe(true);
  });
});
