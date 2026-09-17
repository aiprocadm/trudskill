import { describe, expect, it } from 'vitest';

import { ROLE_NAMES_RU, roleNameRu, roleNamesRu } from './roles.ru';

/** Словарь ролей (ТЗ 4.1 / Я1, решение Р1). */
describe('roles.ru', () => {
  it('называет роль по коду словом из решения Р1', () => {
    expect(roleNameRu('manager')).toBe('Руководитель');
    expect(roleNameRu('tenant_admin')).toBe('Администратор центра');
    expect(roleNameRu('counterparty_rep')).toBe('Представитель заказчика');
  });

  it('синонимы кодов из старых сессий приводятся к каноническому', () => {
    expect(roleNameRu('ADMIN')).toBe('Администратор центра');
    expect(roleNameRu('student')).toBe('Слушатель');
    expect(roleNameRu('methodologist')).toBe('Методист');
  });

  it('неизвестный код не прячется — возвращается как есть', () => {
    expect(roleNameRu('auditor')).toBe('auditor');
  });

  it('имена ролей сессии — без повторов, в порядке словаря, неизвестные в хвосте', () => {
    expect(roleNamesRu(['learner', 'admin', 'tenant_admin', 'student'])).toEqual([
      'Администратор центра',
      'Слушатель'
    ]);
    expect(roleNamesRu(['auditor', 'teacher'])).toEqual(['Преподаватель', 'auditor']);
    expect(roleNamesRu([])).toEqual([]);
  });

  it('все названия — с заглавной только в начале, без латиницы', () => {
    for (const name of Object.values(ROLE_NAMES_RU)) {
      expect(name).toMatch(/^[А-ЯЁ][а-яё]+(?: [а-яё]+)*$/);
    }
  });
});
