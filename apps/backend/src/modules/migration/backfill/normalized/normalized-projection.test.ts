import { describe, expect, it } from 'vitest';

import {
  HOT_COLLECTIONS,
  ProjectionError,
  TABLE_SPECS,
  canonicalHash,
  emptyContext,
  normalizeForHash,
  projectEntity,
  rowToEntity
} from './normalized-projection.js';
import {
  isEncryptedPiiValue,
  passportBlindIndex,
  snilsBlindIndex
} from '../../../../infrastructure/crypto/pii-crypto.js';

const T = 't1';
const base = {
  id: 'x1',
  tenantId: T,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z'
};

describe('проекция снимка в колонки (Фаза 1, срез 0b)', () => {
  it('порядок коллекций уважает внешние ключи: контрагенты → слушатели → группы → … → документы', () => {
    expect(HOT_COLLECTIONS).toEqual([
      'counterparties',
      'learners',
      'groups',
      'groupCourses',
      'enrollments',
      'enrollmentStatusHistory',
      'examResults',
      'generatedDocuments'
    ]);
    for (const c of HOT_COLLECTIONS) expect(TABLE_SPECS[c].columns.tenant_id).toBe('text');
  });

  it('контрагент: ИНН не по формату не роняет строку — уходит в payload, статус вне списка → «не активен»', () => {
    const row = projectEntity(
      'counterparties',
      T,
      { ...base, code: 'CP-1', name: 'Ромашка', inn: '12-34', status: 'blocked', extra: 'x' },
      emptyContext()
    );
    expect(row.columns.inn).toBeNull();
    expect(row.columns.status).toBe('inactive');
    expect(row.payload).toEqual({ inn: '12-34', sourceStatus: 'blocked', extra: 'x' });
  });

  it('контрагент: реквизиты (МГ-D1.1) идут в колонки 0106, кривая дата договора — в payload', () => {
    const row = projectEntity(
      'counterparties',
      T,
      {
        ...base,
        code: 'CP-2',
        name: 'Ромашка',
        shortName: 'ООО «Ромашка»',
        ogrn: '1027700132195',
        managerUserId: 'u-1',
        contractDate: '2026-03-01',
        directorName: 'Иванов И. И.'
      },
      emptyContext()
    );
    expect(row.columns).toMatchObject({
      short_name: 'ООО «Ромашка»',
      ogrn: '1027700132195',
      manager_user_id: 'u-1',
      contract_date: '2026-03-01',
      director_name: 'Иванов И. И.'
    });
    expect(row.payload).toEqual({});

    const imported = projectEntity(
      'counterparties',
      T,
      { ...base, code: 'CP-3', name: 'Лютик', contractDate: '2025-02-31' },
      emptyContext()
    );
    expect(imported.columns.contract_date).toBeNull();
    expect(imported.payload).toEqual({ contractDate: '2025-02-31' });
  });

  it('контрагент без кода — понятная ошибка данных, а не падение сервиса', () => {
    expect(() =>
      projectEntity('counterparties', T, { ...base, name: 'Без кода' }, emptyContext())
    ).toThrow(ProjectionError);
  });

  it('слушатель: ПДн только шифртекстом и слепым индексом, открытых значений в колонках нет', () => {
    const row = projectEntity(
      'learners',
      T,
      {
        ...base,
        firstName: 'Иван',
        lastName: 'Иванов',
        snils: '112-233-445 95',
        email: 'a@b.c',
        phone: '+7',
        dateOfBirth: '1990-01-01',
        linkedIamUserId: 'u_missing',
        status: 'active'
      },
      emptyContext()
    );
    expect(isEncryptedPiiValue(row.columns.snils_enc)).toBe(true);
    expect(isEncryptedPiiValue(row.columns.email_enc)).toBe(true);
    expect(isEncryptedPiiValue(row.columns.phone_enc)).toBe(true);
    expect(isEncryptedPiiValue(row.columns.birth_date_enc)).toBe(true);
    expect(row.columns.snils_hash).toBe(snilsBlindIndex('112-233-445 95'));
    expect(Object.keys(row.columns)).not.toContain('snils');
    expect(JSON.stringify(row)).not.toContain('112-233-445');
    expect(JSON.stringify(row)).not.toContain('a@b.c');
    // учётной записи u_missing нет — ссылка обнуляется, но не теряется
    expect(row.columns.user_id).toBeNull();
    expect(row.payload.linkedIamUserId).toBe('u_missing');
  });

  it('слушатель с уже зашифрованным СНИЛС не шифруется дважды', () => {
    const first = projectEntity(
      'learners',
      T,
      { ...base, firstName: 'А', lastName: 'Б', snils: '112-233-445 95' },
      emptyContext()
    );
    const again = projectEntity(
      'learners',
      T,
      {
        ...base,
        firstName: 'А',
        lastName: 'Б',
        snils: first.columns.snils_enc,
        snilsHash: first.columns.snils_hash
      },
      emptyContext()
    );
    expect(again.columns.snils_enc).toBe(first.columns.snils_enc);
  });

  it('группа: статус closed проходит, чужой → черновик; контрагент не из контекста обнуляется в payload', () => {
    const ctx = emptyContext();
    ctx.counterparties.add('cp1');
    const ok = projectEntity(
      'groups',
      T,
      { ...base, code: 'G1', name: 'Группа', status: 'closed', counterpartyId: 'cp1' },
      ctx
    );
    expect(ok.columns.status).toBe('closed');
    expect(ok.columns.counterparty_id).toBe('cp1');
    const bad = projectEntity(
      'groups',
      T,
      { ...base, code: 'G2', name: 'Группа', status: 'whatever', counterpartyId: 'cp_missing' },
      ctx
    );
    expect(bad.columns.status).toBe('draft');
    expect(bad.columns.counterparty_id).toBeNull();
    expect(bad.payload).toEqual({
      sourceStatus: 'whatever',
      counterpartyId: 'cp_missing',
      // Флаги NOT NULL (0104) подставлены и помечены выдуманными (срез 8.1).
      __synthesized: ['isDot', 'remoteSignature', 'requireIdentity']
    });
  });

  it('зачисление: завершённое без completedAt получает дату из updatedAt; ссылки на группу и слушателя не обнуляются', () => {
    const row = projectEntity(
      'enrollments',
      T,
      { ...base, groupId: 'g_missing', learnerId: 'l1', status: 'completed' },
      emptyContext()
    );
    expect(row.columns.group_id).toBe('g_missing');
    expect(row.columns.completed_at).toBe(base.updatedAt);
    expect(row.columns.enrolled_at).toBe(base.createdAt);
  });

  it('результат экзамена: needs_review проходит, балл необязателен, passed → is_passed', () => {
    const row = projectEntity(
      'examResults',
      T,
      {
        ...base,
        enrollmentId: 'e1',
        learnerId: 'l1',
        testId: 't1',
        status: 'needs_review',
        passed: false,
        attemptsCount: 2,
        maxScore: 20
      },
      emptyContext()
    );
    expect(row.columns.status).toBe('needs_review');
    expect(row.columns.final_score).toBeNull();
    expect(row.columns.is_passed).toBe(false);
    expect(row.columns.attempts_count).toBe(2);
    expect(row.columns.finalized_at).toBe(base.updatedAt);
  });

  it('документ: is_final считается из статуса; отозванный «финальный» — is_final=false с исходным флагом в payload; связи из контекста', () => {
    const ctx = emptyContext();
    ctx.enrollments.set('e1', { groupId: 'g1', learnerId: 'l1' });
    ctx.groups.set('g1', { counterpartyId: 'cp1' });
    const row = projectEntity(
      'generatedDocuments',
      T,
      {
        id: 'd1',
        tenantId: T,
        templateId: 'tpl',
        sourceEntityType: 'enrollment',
        sourceEntityId: 'e1',
        fileId: 'f_missing',
        status: 'revoked',
        isFinal: true,
        documentNumber: 'АБ-1',
        documentDate: '2026-09-02',
        generatedAt: '2026-09-02T10:00:00.000Z',
        variablesSnapshot: { a: 1 },
        documentType: 'certificate',
        name: 'Удостоверение'
      },
      ctx
    );
    expect(row.columns.is_final).toBe(false);
    expect(row.payload.isFinal).toBe(true);
    expect(row.columns.enrollment_id).toBe('e1');
    expect(row.columns.learner_id).toBe('l1');
    expect(row.columns.group_id).toBe('g1');
    expect(row.columns.counterparty_id).toBe('cp1');
    expect(row.columns.storage_file_id).toBeNull();
    expect(row.payload.fileId).toBe('f_missing');
    expect(row.columns.kind_code).toBe('certificate');
    expect(isEncryptedPiiValue(row.columns.variables_snapshot)).toBe(true);
  });

  it('финальный документ получает finalized_at и document_date даже если в снимке их нет', () => {
    const row = projectEntity(
      'generatedDocuments',
      T,
      {
        id: 'd2',
        tenantId: T,
        sourceEntityType: 'group',
        sourceEntityId: 'g1',
        status: 'final',
        isFinal: true,
        documentNumber: 'АБ-2',
        generatedAt: '2026-09-02T10:00:00.000Z'
      },
      emptyContext()
    );
    expect(row.columns.is_final).toBe(true);
    expect(row.columns.document_date).toBe('2026-09-02');
    expect(row.columns.finalized_at).toBe('2026-09-02T10:00:00.000Z');
    expect(row.payload.isFinal).toBeUndefined();
  });
});

describe('хэш сверки одинаков для снимка и перечитанной строки', () => {
  it('числа, даты, булевы и json нормализуются к одному виду', () => {
    expect(normalizeForHash('num', 12.5)).toBe(normalizeForHash('num', '12.50'));
    expect(normalizeForHash('ts', '2026-09-02T10:00:00.000Z')).toBe(
      normalizeForHash('ts', new Date('2026-09-02T10:00:00Z'))
    );
    expect(normalizeForHash('date', '2026-09-02')).toBe(
      normalizeForHash('date', new Date('2026-09-02T00:00:00Z'))
    );
    expect(normalizeForHash('bool', true)).toBe(normalizeForHash('bool', 't'));
    expect(normalizeForHash('json', '{"b":1,"a":2}')).toBe(
      normalizeForHash('json', { a: 2, b: 1 })
    );
    expect(normalizeForHash('text', '')).toBeNull();
  });

  it('created_at/updated_at в хэш не входят, остальные колонки — входят', () => {
    const spec = TABLE_SPECS.groups;
    const a = canonicalHash(spec, {
      id: 'g',
      tenant_id: T,
      code: 'G',
      name: 'N',
      status: 'active',
      created_at: '2026-01-01'
    });
    const b = canonicalHash(spec, {
      id: 'g',
      tenant_id: T,
      code: 'G',
      name: 'N',
      status: 'active',
      created_at: '2027-01-01'
    });
    const c = canonicalHash(spec, {
      id: 'g',
      tenant_id: T,
      code: 'G',
      name: 'N',
      status: 'closed'
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('круговой проход: projectEntity → rowToEntity возвращает сущность снимка', () => {
  /** Как строка выглядит после перечитывания из базы: колонки + payload-объект. */
  const asDbRow = (row: {
    columns: Record<string, unknown>;
    payload: Record<string, unknown>;
  }) => ({
    ...row.columns,
    payload: row.payload
  });

  it('контрагент с плохим ИНН, статусом вне списка и полем импорта', () => {
    const source = {
      ...base,
      code: 'CP-1',
      name: 'Ромашка',
      inn: '12-34',
      status: 'blocked',
      legalName: 'ООО Ромашка',
      contractNumber: 'Д-7'
    };
    const back = rowToEntity(
      'counterparties',
      asDbRow(projectEntity('counterparties', T, source, emptyContext()))
    );
    expect(back).toEqual(source);
  });

  it('группа с чужим статусом и несуществующим контрагентом', () => {
    const source = {
      ...base,
      code: 'G-2',
      name: 'Группа',
      status: 'whatever',
      counterpartyId: 'cp_missing',
      legacyNumber: '77',
      examDate: '2026-10-01'
    };
    const back = rowToEntity('groups', asDbRow(projectEntity('groups', T, source, emptyContext())));
    expect(back).toEqual(source);
  });

  it('значения из базы приходят как Date и строки numeric — наружу уходят ISO и числа', () => {
    const back = rowToEntity('examResults', {
      id: 'x1',
      tenant_id: T,
      created_at: new Date('2026-09-01T10:00:00Z'),
      updated_at: new Date('2026-09-02T10:00:00Z'),
      enrollment_id: 'e1',
      learner_id: 'l1',
      test_id: 't1',
      final_score: '18.00',
      is_passed: true,
      status: 'final',
      finalized_at: new Date('2026-09-02T10:00:00Z'),
      attempts_count: 2,
      payload: {}
    });
    expect(back).toMatchObject({
      createdAt: '2026-09-01T10:00:00.000Z',
      finalScore: 18,
      passed: true,
      attemptsCount: 2
    });
  });

  it('зачисление без completedAt/enrolledAt: даты подставлены в колонки, но обратно не выдумываются', () => {
    const source = { ...base, groupId: 'g1', learnerId: 'l1', status: 'completed' };
    const row = projectEntity('enrollments', T, source, emptyContext());
    expect(row.columns.completed_at).toBe(base.updatedAt);
    expect(row.columns.enrolled_at).toBe(base.createdAt);
    const back = rowToEntity('enrollments', asDbRow(row));
    expect(back).toEqual(source);
    // А если даты были — они возвращаются.
    const withDates = {
      ...source,
      enrolledAt: '2026-08-01T00:00:00.000Z',
      completedAt: '2026-08-15T00:00:00.000Z'
    };
    expect(
      rowToEntity(
        'enrollments',
        asDbRow(projectEntity('enrollments', T, withDates, emptyContext()))
      )
    ).toEqual(withDates);
  });

  it('курс группы без флагов и порядка: в колонках false/0/active, обратно поля не выдумываются (срез 4a)', () => {
    const source = { ...base, groupId: 'g1', courseId: 'c1', durationDays: 30 };
    const row = projectEntity('groupCourses', T, source, emptyContext());
    expect(row.columns.requires_pre_exam_auth).toBe(false);
    expect(row.columns.requires_proctoring).toBe(false);
    expect(row.columns.sort_order).toBe(0);
    expect(row.columns.status).toBe('active');
    expect(rowToEntity('groupCourses', asDbRow(row))).toEqual(source);
    // Флаги, заданные явно, возвращаются как есть — включая явный false.
    const explicit = {
      ...source,
      sortOrder: 2,
      status: 'active',
      requiresPreExamAuth: true,
      requiresIdentityVerification: false,
      requiresProctoring: true
    };
    expect(
      rowToEntity(
        'groupCourses',
        asDbRow(projectEntity('groupCourses', T, explicit, emptyContext()))
      )
    ).toEqual(explicit);
  });

  it('результат экзамена: finalized_at нужен базе, в снимке его нет — обратно не возвращается (срез 4a)', () => {
    const source = {
      ...base,
      enrollmentId: 'e1',
      learnerId: 'l1',
      testId: 't1',
      bestAttemptId: 'a1',
      attemptsCount: 2,
      bestScore: 9,
      finalScore: 9,
      maxScore: 10,
      passingScore: 7,
      passed: true,
      status: 'active'
    };
    const row = projectEntity('examResults', T, source, emptyContext());
    expect(row.columns.finalized_at).toBe(base.updatedAt);
    expect(row.columns.is_passed).toBe(true);
    expect(rowToEntity('examResults', asDbRow(row))).toEqual(source);
    // Результат бэкфилла без attemptsCount тоже не получает выдуманного поля.
    const legacy: Record<string, unknown> = { ...source };
    delete legacy.attemptsCount;
    expect(
      rowToEntity('examResults', asDbRow(projectEntity('examResults', T, legacy, emptyContext())))
    ).toEqual(legacy);
  });

  it('документ: связи из контекста, подстановки и служебные ключи payload обратно не возвращаются (срез 5a)', () => {
    const ctx = emptyContext();
    ctx.enrollments.set('e1', { groupId: 'g1', learnerId: 'l1' });
    ctx.groups.set('g1', { counterpartyId: 'cp1' });
    ctx.files.add('f1');
    // У документа снимка нет createdAt/updatedAt, kindCode, finalizedAt — как у настоящей сущности.
    const source = {
      id: 'd1',
      tenantId: T,
      templateId: 'tpl',
      templateVersionId: 'tplv',
      documentType: 'certificate',
      name: 'Удостоверение',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'e1',
      fileId: 'f1',
      status: 'final',
      isFinal: true,
      documentNumber: 'АБ-1',
      documentDate: '2026-09-02',
      generatedAt: '2026-09-02T10:00:00.000Z',
      qrToken: 'q'.repeat(22),
      learnerNamePublic: 'Иванов И. И.'
    };
    const row = projectEntity('generatedDocuments', T, source, ctx);
    expect(row.columns.learner_id).toBe('l1');
    expect(row.columns.storage_file_id).toBe('f1');
    expect(row.columns.finalized_at).toBe(source.generatedAt);
    const dbRow = asDbRow(row);
    // Отвязка при удалении слушателя в MVP оставляет исходник в служебном ключе.
    dbRow.payload = { ...(dbRow.payload as object), __detached: { learner_id: 'l1' } };
    expect(rowToEntity('generatedDocuments', dbRow)).toEqual(source);
    // Отозванный «финальный» возвращается с исходным флагом.
    const revoked = { ...source, status: 'revoked', revokedAt: '2026-09-03T10:00:00.000Z' };
    expect(
      rowToEntity(
        'generatedDocuments',
        asDbRow(projectEntity('generatedDocuments', T, revoked, ctx))
      )
    ).toEqual(revoked);
  });

  it('группа с полями CDOPROF (срез 8.1): даты в колонках-моментах не возвращаются, всё остальное — как в снимке', () => {
    const source = {
      ...base,
      code: 'G-8',
      name: 'Восьмая',
      status: 'recruiting',
      startDate: '2026-11-05',
      endDate: '2026-12-18',
      examDate: '2026-12-18',
      examAccessFrom: '2026-12-18T00:00:00.000Z',
      examAccessTo: '2026-12-18T23:59:59.000Z',
      materialsAccessUntil: '2027-01-18',
      practiceFrom: '2026-12-01',
      practiceTo: '2026-12-10',
      studyForm: 'distance',
      isDot: true,
      accessMode: 'normal',
      enrollmentMode: 'auto',
      remoteSignature: false,
      requireIdentity: false,
      responsibleUserId: 'u_curator',
      comment: 'вечерняя смена',
      learnerMessage: 'Добро пожаловать',
      notifyOnPass: { email: true, inApp: false },
      closedAt: '2026-12-20T10:00:00.000Z'
    };
    const row = projectEntity('groups', T, source, emptyContext());
    expect(row.columns.starts_at).toBe('2026-11-05');
    expect(row.columns.exam_date).toBe('2026-12-18');
    expect(row.columns.is_dot).toBe(true);
    expect(row.columns.notify_on_pass).toEqual({ email: true, inApp: false });
    expect(row.payload.__synthesized).toBeUndefined();
    const dbRow: Record<string, unknown> = asDbRow(row);
    // База отдаёт моменты как Date, даты как Date, json как объект.
    dbRow.starts_at = new Date('2026-11-05T00:00:00.000Z');
    dbRow.ends_at = new Date('2026-12-18T00:00:00.000Z');
    dbRow.exam_date = new Date('2026-12-18T00:00:00.000Z');
    expect(rowToEntity('groups', dbRow)).toEqual(source);
  });

  it('история статусов: created_at нужен базе, но у сущности снимка его нет — обратно не возвращается', () => {
    const source = {
      id: 'h1',
      tenantId: T,
      enrollmentId: 'e1',
      status: 'completed',
      changedAt: base.updatedAt,
      reason: 'сдал'
    };
    const back = rowToEntity(
      'enrollmentStatusHistory',
      asDbRow(projectEntity('enrollmentStatusHistory', T, source, emptyContext()))
    );
    expect(back).toEqual(source);
  });
});

// МГ-C1.1 (срез 8.12, РМ76–РМ77): паспорт — в свою колонку шифртекстом с индексом, личное дело — в колонки.
describe('проекция личного дела слушателя', () => {
  it('паспорт уходит в passport_enc/passport_hash без открытых цифр, поля §4 — в колонки, а не в payload', () => {
    const row = projectEntity(
      'learners',
      'tenant_demo',
      {
        id: 'lrn_p',
        tenantId: 'tenant_demo',
        status: 'active',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
        firstName: 'Анна',
        lastName: 'Новикова',
        passport: { series: '4512', number: '123456' },
        gender: 'f',
        citizenship: 'РФ',
        registrationAddress: 'г. Москва',
        diploma: { series: 'АБ', number: '1' },
        counterpartyId: 'cp_1'
      } as never,
      emptyContext()
    );
    expect(isEncryptedPiiValue(row.columns.passport_enc)).toBe(true);
    expect(row.columns.passport_hash).toBe(passportBlindIndex('4512123456'));
    expect(JSON.stringify(row)).not.toContain('123456');
    expect(row.columns).toMatchObject({
      gender: 'f',
      citizenship: 'РФ',
      registration_address: 'г. Москва',
      counterparty_id: 'cp_1'
    });
    expect(row.columns.diploma).toEqual({ series: 'АБ', number: '1' });
    expect(row.payload).not.toHaveProperty('passport');
    expect(row.payload).not.toHaveProperty('gender');
  });
});
