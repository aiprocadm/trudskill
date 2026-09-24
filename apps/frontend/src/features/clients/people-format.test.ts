import { describe, expect, it } from 'vitest';

import { employeeName, employeesBulkSummary, parseEmployeesPaste } from './people-format';

describe('люди компании: разбор списка и итог (МГ-D2.1, срез 14.2)', () => {
  it('строка «ФИО; должность; почта; телефон; номер» раскладывается по полям, пустые строки пропускаются', () => {
    const rows = parseEmployeesPaste(
      'Иванов Иван Иванович; Электромонтёр; ivanov@romashka.ru; +7 900; 117\n\n' +
        'Петрова Анна\tБухгалтер\n' +
        'Оглы Мамед Ахмед Оглы;;;;\n' +
        'Кузнецов'
    );
    expect(rows).toEqual([
      {
        lastName: 'Иванов',
        firstName: 'Иван',
        middleName: 'Иванович',
        position: 'Электромонтёр',
        email: 'ivanov@romashka.ru',
        phone: '+7 900',
        employeeNo: '117'
      },
      { lastName: 'Петрова', firstName: 'Анна', position: 'Бухгалтер' },
      { lastName: 'Оглы', firstName: 'Мамед', middleName: 'Ахмед Оглы' },
      { lastName: 'Кузнецов' }
    ]);
  });

  it('итог для экрана: заведённые — успех, пропущенные и отказы — поимённо с причиной', () => {
    expect(
      employeesBulkSummary({
        total: 3,
        created: 1,
        skipped: 1,
        failed: 1,
        rows: [
          { rowNumber: 1, status: 'created', employeeId: 'ce_1', fullName: 'Иванов Иван' },
          {
            rowNumber: 2,
            status: 'skipped',
            fullName: 'Петрова Анна',
            reason: 'Уже есть среди сотрудников компании.'
          },
          { rowNumber: 3, status: 'failed', fullName: 'Кузнецов', reason: 'Нужны фамилия и имя.' }
        ]
      })
    ).toEqual({
      total: 3,
      succeeded: 1,
      failures: [
        {
          label: 'Строка 2: Петрова Анна',
          reason: 'пропущен — Уже есть среди сотрудников компании.'
        },
        { label: 'Строка 3: Кузнецов', reason: 'Нужны фамилия и имя.' }
      ]
    });
    expect(employeeName({ lastName: 'Иванов', firstName: 'Иван' })).toBe('Иванов Иван');
  });
});
