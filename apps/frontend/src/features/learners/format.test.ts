import { describe, expect, it } from 'vitest';

import {
  EMPTY_LEARNER_FORM,
  STATUS_LABEL,
  buildUpdatePayload,
  formatFullName,
  formatSnils,
  passportFormHint,
  toEditFormState
} from './format';

describe('formatFullName', () => {
  it('joins lastName firstName middleName', () => {
    expect(formatFullName({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Петрович' })).toBe(
      'Иванов Иван Петрович'
    );
  });
  it('skips missing middleName', () => {
    expect(formatFullName({ lastName: 'Иванов', firstName: 'Иван' })).toBe('Иванов Иван');
  });
  it('trims and filters empty parts', () => {
    expect(formatFullName({ lastName: ' Иванов ', firstName: ' Иван ', middleName: '' })).toBe(
      'Иванов Иван'
    );
  });
});

describe('formatSnils', () => {
  it('returns dash for undefined', () => {
    expect(formatSnils(undefined)).toBe('—');
  });
  it('formats raw digits', () => {
    expect(formatSnils('12345678901')).toBe('123-456-789 01');
  });
  it('keeps already-masked value', () => {
    expect(formatSnils('123-456-789 01')).toBe('123-456-789 01');
  });
  it('passes through invalid length unchanged', () => {
    expect(formatSnils('12345')).toBe('12345');
  });
});

describe('STATUS_LABEL', () => {
  it('has Russian labels for both statuses', () => {
    expect(STATUS_LABEL.active).toBe('Активен');
    expect(STATUS_LABEL.archived).toBe('В архиве');
  });
});

describe('buildUpdatePayload', () => {
  it('nullifies empty optional fields and trims', () => {
    const result = buildUpdatePayload({
      ...EMPTY_LEARNER_FORM,
      firstName: ' Иван ',
      lastName: ' Иванов ',
      middleName: '   ',
      email: '',
      snils: ' 123-456-789 01 ',
      dateOfBirth: '1990-05-01',
      position: 'инженер',
      organizationUnitId: '',
      learnerNo: '',
      status: 'active'
    });
    // Без исходной формы уходит всё (заведение); личное дело — null, как пустое.
    expect(result).toMatchObject({
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: null,
      email: null,
      snils: '123-456-789 01',
      dateOfBirth: '1990-05-01',
      position: 'инженер',
      organizationUnitId: null,
      learnerNo: null,
      status: 'active',
      passport: null,
      gender: null
    });
  });
});

// МГ-C1.1 (срез 8.12b): в запрос уходит только разница; маски сервера не отправляются.
describe('buildUpdatePayload — только разница', () => {
  const learner = {
    id: 'l1',
    tenantId: 't',
    firstName: 'Иван',
    lastName: 'Иванов',
    snils: '***-***-*** 95',
    dateOfBirth: '**.**.1990',
    passport: '**** ***456',
    status: 'active' as const,
    createdAt: '',
    updatedAt: ''
  };

  it('неизменённая форма — пустой запрос; маскированные СНИЛС и дата не уходят никогда', () => {
    const initial = toEditFormState(learner);
    expect(buildUpdatePayload({ ...initial }, initial)).toEqual({});
    expect(initial.passportSeries).toBe('');
    expect(
      buildUpdatePayload({ ...initial, snils: '***-***-*** 95 ', position: 'мастер' }, initial)
    ).toEqual({ position: 'мастер' });
  });

  it('паспорт уходит объектом, когда заполнены серия и номер; очистка — null; половина — подсказка', () => {
    const initial = toEditFormState(learner);
    const filled = {
      ...initial,
      passportSeries: '4512',
      passportNumber: '123456',
      passportIssuedBy: 'ОВД'
    };
    expect(buildUpdatePayload(filled, initial)).toEqual({
      passport: { series: '4512', number: '123456', issuedBy: 'ОВД' }
    });
    expect(passportFormHint(filled)).toBeUndefined();
    expect(passportFormHint({ ...initial, passportSeries: '4512' })).toMatch(/серию, и номер/);
    const cleared = { ...filled, passportSeries: '', passportNumber: '', passportIssuedBy: '' };
    expect(buildUpdatePayload(cleared, filled)).toEqual({ passport: null });
  });

  it('пол, компания и диплом: пустое — null, заполненное — значение', () => {
    const initial = toEditFormState(learner);
    expect(
      buildUpdatePayload(
        {
          ...initial,
          gender: 'f',
          counterpartyId: 'cp1',
          diplomaNumber: '77',
          diplomaInstitution: 'МГУ'
        },
        initial
      )
    ).toEqual({
      gender: 'f',
      counterpartyId: 'cp1',
      diploma: { number: '77', institution: 'МГУ' }
    });
    expect(buildUpdatePayload({ ...initial, gender: '' }, { ...initial, gender: 'm' })).toEqual({
      gender: null
    });
  });
});

// МГ-C1.3 (срез 8.14b, РМ87): именованные поля — только изменённые ключи, пустая строка = удалить.
describe('buildUpdatePayload — именованные поля центра', () => {
  it('уходят только изменённые ключи; нетронутые (в том числе legacy_N) не отправляются', () => {
    const initial = toEditFormState({
      id: 'l1',
      tenantId: 't',
      firstName: 'Иван',
      lastName: 'Иванов',
      status: 'active' as const,
      createdAt: '',
      updatedAt: '',
      extraFields: { legacy_1: 'старое', otdel: 'Цех 1' }
    });
    expect(initial.extraFields).toEqual({ legacy_1: 'старое', otdel: 'Цех 1' });
    expect(buildUpdatePayload({ ...initial }, initial)).toEqual({});
    const form = {
      ...initial,
      extraFields: { ...initial.extraFields, otdel: ' Цех 2 ', start: '2026-03-01' }
    };
    expect(buildUpdatePayload(form, initial)).toEqual({
      extraFields: { otdel: 'Цех 2', start: '2026-03-01' }
    });
    const cleared = { ...initial, extraFields: { legacy_1: 'старое', otdel: '' } };
    expect(buildUpdatePayload(cleared, initial)).toEqual({ extraFields: { otdel: '' } });
  });

  it('без исходной формы (заведение) уходят только непустые значения', () => {
    expect(
      buildUpdatePayload({
        ...EMPTY_LEARNER_FORM,
        firstName: 'И',
        lastName: 'И',
        extraFields: { a: '1', b: '' }
      }).extraFields
    ).toEqual({ a: '1' });
    expect(
      buildUpdatePayload({ ...EMPTY_LEARNER_FORM, firstName: 'И', lastName: 'И' }).extraFields
    ).toBeUndefined();
  });
});
