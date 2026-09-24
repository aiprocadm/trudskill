import { describe, expect, it } from 'vitest';

import {
  composeFullName,
  parseImportDate,
  parseImportEducationLevel,
  parseImportGender,
  parseImportInn,
  parseImportPhone,
  passportProblem,
  profileSummary
} from './import-fields';

/** Зеркало серверных нормализаторов колонок (МГ-C3.1, срез 10.2). */
describe('колонки импорта на фронте', () => {
  it('пол, дата, образование, ИНН, телефон — как на сервере', () => {
    expect(parseImportGender('Ж')).toBe('f');
    expect(parseImportGender('да')).toBeNull();
    expect(parseImportDate('01.03.1990')).toBe('1990-03-01');
    expect(parseImportDate('31.02.1990')).toBeNull();
    expect(parseImportEducationLevel('Высшее — бакалавриат')).toBe('higher_bachelor');
    expect(parseImportEducationLevel('higher_bachelor')).toBe('higher_bachelor');
    expect(parseImportEducationLevel('ПТУ')).toBeNull();
    expect(parseImportInn('ИНН 7701234567')).toBe('7701234567');
    expect(parseImportInn('123')).toBeNull();
    expect(parseImportPhone('+7 (900) 123-45-67')).toBe('+79001234567');
    expect(parseImportPhone('12')).toBeNull();
  });

  it('паспорт наполовину — проблема; ФИО собирается из частей; сводка без сырых кодов', () => {
    expect(passportProblem({ passportSeries: '45 12' })).toBe(true);
    expect(passportProblem({ passportSeries: '45 12', passportNumber: '123456' })).toBe(false);
    expect(passportProblem({})).toBe(false);
    expect(composeFullName({ lastName: 'Иванов', firstName: 'Иван' })).toBe('Иванов Иван');
    expect(
      profileSummary({
        position: 'Инженер',
        dateOfBirth: '01.03.1990',
        passportNumber: '1',
        companyInn: '7701234567'
      })
    ).toBe('Инженер · род. 01.03.1990 · паспорт · ИНН 7701234567');
  });
});
