import { describe, expect, it } from 'vitest';

import { loadFixtureDataset } from '../sources/fixture-cdoprof-transport.js';
import { isValidInn } from '../validators/inn.js';

/**
 * Сторож МГ-K1.1 «ПДн в репозиторий не попадают».
 *
 * Фикстуры выглядят как настоящие ответы CDOPROF — иначе они ничего не проверяют. Но выглядеть
 * как настоящие и БЫТЬ настоящими — разные вещи, и граница между ними должна держаться тестом,
 * а не памятью того, кто правил JSON последним. Три признака, по которым запись заведомо ничья:
 *
 *   • ИНН не проходит контрольную сумму ФНС — такого ИНН не существует ни у кого;
 *   • почта только в зоне `example.invalid` — зона зарезервирована RFC 2606 и не делегируется;
 *   • телефон только с кодом `+7 000` — такого кода в нумерации нет.
 */
const walk = (value: unknown, visit: (key: string, leaf: string) => void, key = ''): void => {
  if (typeof value === 'string') {
    visit(key, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, key);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(v, visit, k);
  }
};

describe('фикстуры CDOPROF обезличены', () => {
  const dataset = loadFixtureDataset();

  it('каждый ИНН не проходит контрольную сумму', () => {
    const inns: string[] = [];
    walk(dataset, (key, leaf) => {
      if (key === 'inn' && leaf.trim() !== '') inns.push(leaf);
    });

    expect(inns.length).toBeGreaterThan(0);
    for (const inn of inns) {
      expect(isValidInn(inn), `ИНН ${inn} выглядит настоящим`).toBe(false);
    }
  });

  it('каждая почта — в зоне example.invalid или заведомо не адрес', () => {
    const emails: string[] = [];
    walk(dataset, (key, leaf) => {
      if (key === 'email' && leaf.includes('@')) emails.push(leaf);
    });

    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) {
      expect(email.endsWith('@example.invalid'), `почта ${email} выглядит настоящей`).toBe(true);
    }
  });

  it('каждый телефон начинается с несуществующего кода +7 000', () => {
    const phones: string[] = [];
    walk(dataset, (key, leaf) => {
      if (key === 'phone') phones.push(leaf);
    });

    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) {
      expect(phone.startsWith('+7 000'), `телефон ${phone} выглядит настоящим`).toBe(true);
    }
  });

  it('набор содержит известную грязь источника, на которой учится импорт', () => {
    const students = dataset.students as Array<Record<string, unknown>>;
    const groups = dataset.groups as Array<Record<string, unknown>>;
    const contragents = dataset.contragents as Array<Record<string, unknown>>;

    expect(students.some((s) => s.data_rozdeniya === '2109-12-01')).toBe(true);
    expect(students.some((s) => s.dolznost === 'undefined')).toBe(true);
    expect(students.some((s) => s.surname === null && typeof s.full_name === 'string')).toBe(true);
    expect(contragents.some((c) => c.inn === '')).toBe(true);
    expect(contragents.some((c) => String(c.inn).length === 12)).toBe(true);
    const names = groups.map((g) => g.name_group);
    expect(new Set(names).size).toBeLessThan(names.length);
    expect(groups.some((g) => g.date_on === null && g.date_off === null)).toBe(true);
  });
});
