import { describe, expect, it } from 'vitest';

import {
  filterByCounterparty,
  resolveCounterpartyScope,
  scopeAllows,
  scopeAllowsEntity
} from './counterparty-scope.js';

describe('resolveCounterpartyScope (ФТ-E5)', () => {
  it('персонал центра не ограничен — он и должен видеть всех заказчиков', () => {
    expect(resolveCounterpartyScope({})).toEqual({ restricted: false });
    expect(resolveCounterpartyScope({ counterpartyId: null })).toEqual({ restricted: false });
  });

  it('представитель заказчика ограничен своим контрагентом', () => {
    expect(resolveCounterpartyScope({ counterpartyId: 'cp_1' })).toEqual({
      restricted: true,
      counterpartyId: 'cp_1'
    });
  });

  it('пробелы вместо привязки — это отсутствие привязки, а не пустой контрагент', () => {
    expect(resolveCounterpartyScope({ counterpartyId: '   ' })).toEqual({ restricted: false });
  });
});

describe('scopeAllows', () => {
  const rep = resolveCounterpartyScope({ counterpartyId: 'cp_1' });
  const staff = resolveCounterpartyScope({});

  it('свой контрагент виден', () => {
    expect(scopeAllows(rep, 'cp_1')).toBe(true);
  });

  it('ЧУЖОЙ контрагент не виден — это и есть суть требования', () => {
    expect(scopeAllows(rep, 'cp_2')).toBe(false);
  });

  it('сущность БЕЗ контрагента представителю не видна', () => {
    // Группа без заказчика — внутренняя группа центра. Правило «нет владельца, значит
    // общий» превратило бы каждую незаполненную связь в дыру.
    expect(scopeAllows(rep, undefined)).toBe(false);
  });

  it('персоналу видно всё, включая сущности без контрагента', () => {
    expect(scopeAllows(staff, undefined)).toBe(true);
    expect(scopeAllows(staff, 'cp_2')).toBe(true);
  });
});

describe('filterByCounterparty', () => {
  const items = [
    { id: 'g1', counterpartyId: 'cp_1' },
    { id: 'g2', counterpartyId: 'cp_2' },
    { id: 'g3' } as { id: string; counterpartyId?: string }
  ];

  it('представителю остаются только свои', () => {
    const scope = resolveCounterpartyScope({ counterpartyId: 'cp_1' });
    expect(filterByCounterparty(scope, items, (i) => i.counterpartyId).map((i) => i.id)).toEqual([
      'g1'
    ]);
  });

  it('персоналу список не режется', () => {
    const scope = resolveCounterpartyScope({});
    expect(filterByCounterparty(scope, items, (i) => i.counterpartyId)).toHaveLength(3);
  });

  it('возвращается копия — исходный список не мутируется', () => {
    const scope = resolveCounterpartyScope({});
    const out = filterByCounterparty(scope, items, (i) => i.counterpartyId);
    out.pop();
    expect(items).toHaveLength(3);
  });
});

describe('scopeAllowsEntity', () => {
  const rep = resolveCounterpartyScope({ counterpartyId: 'cp_1' });

  it('несуществующая сущность недоступна', () => {
    expect(scopeAllowsEntity(rep, undefined)).toBe(false);
  });

  it('чужая сущность неотличима от несуществующей', () => {
    // Оба случая дают false: вызывающий отвечает «не найдено». Отказ, отличающий
    // чужую запись от несуществующей, сам выдаёт факт её существования.
    expect(scopeAllowsEntity(rep, { counterpartyId: 'cp_2' })).toBe(false);
    expect(scopeAllowsEntity(rep, undefined)).toBe(false);
  });

  it('своя сущность доступна', () => {
    expect(scopeAllowsEntity(rep, { counterpartyId: 'cp_1' })).toBe(true);
  });
});
