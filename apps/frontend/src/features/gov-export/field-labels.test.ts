import { describe, expect, it } from 'vitest';

import { describeRowError, fieldLabel } from './field-labels';

describe('строка отказа выгрузки читается человеком', () => {
  it('имя поля выводится по-русски, а не как в коде', () => {
    expect(
      describeRowError({
        field: 'dateOfBirth',
        message: 'не заполнена',
        fullName: 'Иванов Иван Иванович'
      })
    ).toBe('Иванов Иван Иванович · Дата рождения: не заполнена');
  });

  it('неизвестное поле не выводится вовсе — «неизвестно» хуже, чем ничего', () => {
    expect(describeRowError({ field: 'someNewField', message: 'что-то не так' })).toBe(
      'Строка без имени: что-то не так'
    );
  });

  it('в словаре нет латиницы как значения', () => {
    /*
     * Правило «ни одного англицизма как значения» действует и здесь: подпись поля читает
     * администратор учебного центра, а не разработчик.
     */
    for (const field of ['fullName', 'snils', 'dateOfBirth', 'employerInn', 'knowledgeCheckDate']) {
      expect(fieldLabel(field), field).toBeDefined();
      expect(fieldLabel(field)!, field).not.toMatch(/[A-Za-z]/);
    }
  });
});
