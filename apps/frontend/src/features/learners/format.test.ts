import { describe, expect, it } from 'vitest';

import { STATUS_LABEL, buildUpdatePayload, formatFullName, formatSnils } from './format';

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
      firstName: ' Иван ',
      lastName: ' Иванов ',
      middleName: '   ',
      email: '',
      snils: ' 123-456-789 01 ',
      position: 'инженер',
      organizationUnitId: '',
      learnerNo: '',
      status: 'active'
    });
    expect(result).toEqual({
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: null,
      email: null,
      snils: '123-456-789 01',
      position: 'инженер',
      organizationUnitId: null,
      learnerNo: null,
      status: 'active'
    });
  });
});
