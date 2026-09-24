import { describe, expect, it } from 'vitest';

import {
  composeFullName,
  parseImportDate,
  parseImportEducationLevel,
  parseImportGender,
  parseImportInn,
  parseImportPassport,
  parseImportPhone
} from './learner-import-fields.js';

/** Колонки расширенного импорта (МГ-C3.1, срез 10.1, РМ100–РМ102). */
describe('нормализаторы колонок импорта', () => {
  it('пол: привычные записи → m/f, пусто → "", мусор → null', () => {
    expect(parseImportGender('Ж')).toBe('f');
    expect(parseImportGender('муж.')).toBe('m');
    expect(parseImportGender('male')).toBe('m');
    expect(parseImportGender('')).toBe('');
    expect(parseImportGender('неизвестно')).toBeNull();
  });

  it('дата: ISO и русская запись → ISO; несуществующий день → null', () => {
    expect(parseImportDate('1990-03-01')).toBe('1990-03-01');
    expect(parseImportDate('01.03.1990')).toBe('1990-03-01');
    expect(parseImportDate('1/3/1990')).toBe('1990-03-01');
    expect(parseImportDate('31.02.1990')).toBeNull();
    expect(parseImportDate('вчера')).toBeNull();
    expect(parseImportDate(undefined)).toBe('');
  });

  it('образование: код ФРДО или русская подпись → код; неизвестное → null', () => {
    expect(parseImportEducationLevel('higher_bachelor')).toBe('higher_bachelor');
    expect(parseImportEducationLevel('Высшее — бакалавриат')).toBe('higher_bachelor');
    expect(parseImportEducationLevel('среднее профессиональное')).toBe('secondary_vocational');
    expect(parseImportEducationLevel('ПТУ')).toBeNull();
    expect(parseImportEducationLevel('')).toBe('');
  });

  it('ИНН: 10 или 12 цифр, лишние знаки отбрасываются; телефон — от 10 цифр с ведущим плюсом', () => {
    expect(parseImportInn('7701234567')).toBe('7701234567');
    expect(parseImportInn('ИНН 7701234567')).toBe('7701234567');
    expect(parseImportInn('770123456789')).toBe('770123456789');
    expect(parseImportInn('123')).toBeNull();
    expect(parseImportPhone('+7 (900) 123-45-67')).toBe('+79001234567');
    expect(parseImportPhone('8 900 123 45 67')).toBe('89001234567');
    expect(parseImportPhone('12345')).toBeNull();
  });

  it('паспорт: серия и номер вместе или никак; половина и кривая дата выдачи — null', () => {
    expect(
      parseImportPassport({
        series: '45 12',
        number: '123456',
        issuedAt: '01.02.2015',
        issuedBy: 'ОВД'
      })
    ).toEqual({ series: '45 12', number: '123456', issuedAt: '2015-02-01', issuedBy: 'ОВД' });
    expect(parseImportPassport({ series: '45 12' })).toBeNull();
    expect(parseImportPassport({ issuedBy: 'ОВД' })).toBeNull();
    expect(parseImportPassport({ series: '45 12', number: '1', issuedAt: 'нет' })).toBeNull();
    expect(parseImportPassport({})).toBe('');
  });

  it('ФИО: колонка «ФИО» главнее, иначе собирается из фамилии, имени и отчества', () => {
    expect(composeFullName({ fullName: ' Иванов Иван ', lastName: 'Петров' })).toBe('Иванов Иван');
    expect(composeFullName({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' })).toBe(
      'Иванов Иван Иванович'
    );
    expect(composeFullName({ lastName: 'Иванов', firstName: 'Иван' })).toBe('Иванов Иван');
  });
});
