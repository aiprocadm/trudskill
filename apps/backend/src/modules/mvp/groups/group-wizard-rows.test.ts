import { describe, expect, it } from 'vitest';

import { classifyWizardLearnerRows, splitWizardLearnerLine } from './group-wizard-rows.js';

/** Шаг 3 мастера (МГ-B2): строки «ФИО; должность; СНИЛС; email; телефон», частичный успех. */
describe('строки слушателей мастера группы', () => {
  it('строка режется по «;» или табуляции, пустые ячейки не становятся полями', () => {
    expect(
      splitWizardLearnerLine('Иванов Иван Иванович; инженер; 112-233-445 95; ivan@x.ru; +7 900', 1)
    ).toEqual({
      rowNumber: 1,
      fullName: 'Иванов Иван Иванович',
      position: 'инженер',
      snils: '112-233-445 95',
      email: 'ivan@x.ru',
      phone: '+7 900'
    });
    expect(splitWizardLearnerLine('Петров Пётр\t\t\tpetr@x.ru', 2)).toEqual({
      rowNumber: 2,
      fullName: 'Петров Пётр',
      email: 'petr@x.ru'
    });
  });

  it('ФИО без имени, плохой СНИЛС, кривая почта и дубль в пачке — отказ строкой; остальные приняты', () => {
    const { accepted, rejected } = classifyWizardLearnerRows([
      {
        rowNumber: 1,
        fullName: 'Иванов Иван Иванович',
        snils: '112-233-445 95',
        email: 'Ivan@X.ru'
      },
      { rowNumber: 2, fullName: 'Иванов' },
      { rowNumber: 3, fullName: 'Сидоров Сидор', snils: '123-456-789 00' },
      { rowNumber: 4, fullName: 'Кузнецова Анна', email: 'anna@' },
      { rowNumber: 5, fullName: 'Иванов Иван', email: 'ivan@x.ru' },
      { rowNumber: 6, fullName: 'Смирнова Ольга', position: ' бухгалтер ', phone: '+7 911' }
    ]);
    expect(accepted.map((r) => r.rowNumber)).toEqual([1, 6]);
    expect(accepted[0]).toEqual({
      rowNumber: 1,
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Иванович',
      snils: '11223344595',
      email: 'ivan@x.ru'
    });
    expect(accepted[1]).toMatchObject({ position: 'бухгалтер', phone: '+7 911' });
    expect(rejected.map((r) => [r.rowNumber, r.code])).toEqual([
      [2, 'fullname_invalid'],
      [3, 'snils_invalid'],
      [4, 'email_invalid'],
      [5, 'duplicate_in_batch']
    ]);
  });
});
