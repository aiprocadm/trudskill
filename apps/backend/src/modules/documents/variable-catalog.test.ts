import { describe, expect, it } from 'vitest';

import {
  resolveCounterpartyVariables,
  resolveCourseVariables,
  resolveGroupVariables,
  resolveLearnerVariables,
  resolveTenantVariables
} from './entity-variables.js';
import {
  resolveCommissionVariables,
  resolveDocumentVariables,
  resolveEnrollmentVariables,
  resolveGroupLearnersVariables,
  resolveProgramVariables
} from './pillar-a-variables.js';
import {
  VARIABLE_CATALOG,
  allVariableCodes,
  classifyPlaceholders,
  isKnownVariable
} from './variable-catalog.js';

import type { GeneratedDocumentEntity } from './documents.types.js';

/** «Богатые» снимки: каждое поле заполнено, чтобы пустой результат означал ТОЛЬКО дыру в резолвере. */
const base = { tenantId: 't', status: 'active' as const, createdAt: '', updatedAt: '' };

const learner = {
  ...base,
  id: 'l1',
  learnerNo: 'L-1',
  firstName: 'Иван',
  lastName: 'Иванов',
  middleName: 'Иванович',
  email: 'a@b.ru',
  snils: '112-233-445 95',
  position: 'Инженер',
  dateOfBirth: '1985-03-05'
} as never;

const enrollment = {
  ...base,
  id: 'e1',
  groupId: 'g1',
  learnerId: 'l1',
  enrolledAt: '2026-01-10',
  plannedEndAt: '2026-02-10',
  completedAt: '2026-02-08'
} as never;

const courseVersion = {
  ...base,
  id: 'cv1',
  courseId: 'c1',
  versionNo: 1,
  academicHours: 40,
  trainingType: 'primary',
  learnerCategory: 'manager',
  studyForm: 'distance',
  finalAssessmentForm: 'test',
  regulatoryBasisCodes: ['PP_2464_2022'],
  commissionId: 'com1'
} as never;

const commission = {
  ...base,
  id: 'com1',
  code: 'K-1',
  name: 'Комиссия',
  description: 'Описание'
} as never;
const members = [
  {
    ...base,
    id: 'm1',
    commissionId: 'com1',
    role: 'chairman',
    externalFullName: 'Петров П. П.',
    externalPosition: 'Директор',
    signatureFileId: 'sig1',
    positionInOrder: 1
  },
  {
    ...base,
    id: 'm2',
    commissionId: 'com1',
    role: 'secretary',
    externalFullName: 'Сидорова А. А.',
    externalPosition: 'Секретарь',
    signatureFileId: 'sig2',
    positionInOrder: 2
  }
] as never;

const document = {
  ...base,
  id: 'gdoc1',
  documentType: 'certificate',
  documentNumber: '26-ОТ-0001',
  documentDate: '2026-07-26',
  qrToken: 'tok123'
} as GeneratedDocumentEntity;

const acts = [
  {
    code: 'PP_2464_2022',
    shortName: 'ПП 2464',
    fullName: 'Постановление…',
    issuingAuthority: 'Правительство РФ',
    issuedAt: '2022-12-24',
    appliesToVerticals: ['ot'],
    isActive: true,
    createdAt: ''
  }
] as never;

/** Тот же набор резолверов, что вызывает сборщик, но без DI. */
function resolveEverything(codes: string[]): Record<string, unknown> {
  const pick = (prefix: string) => codes.filter((c) => c.startsWith(prefix));
  return {
    ...resolveTenantVariables(
      {
        tenant: { id: 't', code: 'DEMO', name: 'УЦ', status: 'active' },
        requisites: { tenantId: 't', legalName: 'ООО УЦ', taxNumber: '7701', payload: {} },
        licenses: [
          {
            id: 'lic',
            tenantId: 't',
            licenseType: 'education_license',
            licenseNumber: 'Л-1',
            issuerName: 'Рособрнадзор',
            issuedAt: '2024-02-01',
            status: 'active',
            createdAt: '',
            updatedAt: ''
          },
          {
            id: 'acc',
            tenantId: 't',
            licenseType: 'accreditation',
            licenseNumber: 'АКК-1',
            issuerName: 'Минтруд',
            issuedAt: '2024-03-01',
            status: 'active',
            createdAt: '',
            updatedAt: ''
          }
        ]
      },
      pick('tenant.')
    ),
    ...resolveLearnerVariables({ learner }, pick('learner.')),
    ...resolveCounterpartyVariables(
      {
        counterparty: {
          ...base,
          id: 'cp1',
          code: 'CP',
          name: 'АО Завод',
          legalName: 'АО «Завод»',
          inn: '77',
          kpp: '77',
          legalAddress: 'Москва',
          contactEmail: 'c@d.ru',
          contactPhone: '+7'
        } as never
      },
      pick('counterparty.')
    ),
    ...resolveGroupVariables(
      {
        group: { ...base, id: 'g1', code: 'G-1', name: 'Группа' } as never,
        counterparty: { ...base, id: 'cp1', code: 'CP', name: 'АО Завод' } as never
      },
      pick('group.')
    ),
    ...resolveCourseVariables(
      {
        course: { ...base, id: 'c1', code: 'OT', title: 'Курс', description: 'Описание' } as never
      },
      pick('course.')
    ),
    ...resolveProgramVariables(
      { courseVersion, regulatoryActs: acts, commission },
      pick('program.')
    ),
    ...resolveCommissionVariables({ commission, members }, pick('commission.')),
    ...resolveEnrollmentVariables({ enrollment }, pick('enrollment.')),
    ...resolveDocumentVariables(
      { document, publicBaseUrl: 'https://lms.example' },
      pick('document.')
    ),
    ...resolveGroupLearnersVariables(
      { learners: [learner], enrollments: [enrollment] },
      codes.filter((c) => c.startsWith('group_learners'))
    )
  };
}

describe('VARIABLE_CATALOG (ФТ-A2.1/A2.3)', () => {
  it('has unique codes', () => {
    const codes = allVariableCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every entry code matches its declared category', () => {
    for (const item of VARIABLE_CATALOG) {
      if (item.category === 'group_learners' && !item.code.includes('.')) continue;
      expect(item.code.startsWith(`${item.category}.`)).toBe(true);
    }
  });

  it('covers all ten categories of the CHECK constraint (migration 0032)', () => {
    const categories = new Set(VARIABLE_CATALOG.map((item) => item.category));
    expect([...categories].sort()).toEqual(
      [
        'commission',
        'counterparty',
        'course',
        'document',
        'enrollment',
        'group',
        'group_learners',
        'learner',
        'program',
        'tenant'
      ].sort()
    );
  });

  it('SYNC GUARD: every catalogued variable is actually resolved (no lying to the admin)', () => {
    const codes = allVariableCodes();
    const resolved = resolveEverything(codes);
    // На «богатых» данных пустое значение = забытая ветка в resolver'е либо опечатка в коде каталога.
    const notResolved = codes.filter((code) => {
      const value = resolved[code];
      if (Array.isArray(value)) return value.length === 0;
      return value === undefined || value === '';
    });
    // Дата выдачи прописью собирается в builder'е (нужна дата документа), а не в pure-резолвере.
    expect(notResolved).toEqual(['document.issue_date_words']);
  });

  it('every entry has a human-readable Russian description for the admin UI', () => {
    for (const item of VARIABLE_CATALOG) {
      // «Имя», «ИНН» — законно короткие описания, требуем лишь осмысленности.
      expect(item.description.trim().length).toBeGreaterThanOrEqual(3);
      expect(/[А-Яа-я]/.test(item.description)).toBe(true);
    }
  });
});

describe('classifyPlaceholders (основа таблицы ФТ-A3.2)', () => {
  it('splits placeholders found in a blank into known and unknown', () => {
    const { known, unknown } = classifyPlaceholders([
      'learner.full_name',
      'tenant.license_number',
      'learner.favourite_colour',
      'group_learners'
    ]);
    expect(known.map((item) => item.code)).toEqual([
      'learner.full_name',
      'tenant.license_number',
      'group_learners'
    ]);
    expect(unknown).toEqual(['learner.favourite_colour']);
  });

  it('isKnownVariable answers for both dotted and bare codes', () => {
    expect(isKnownVariable('document.number')).toBe(true);
    expect(isKnownVariable('group_learners_count')).toBe(true);
    expect(isKnownVariable('nope.nope')).toBe(false);
  });
});
