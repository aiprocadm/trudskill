import { describe, expect, it } from 'vitest';

import { isOverdue, sortByUrgency } from './attention.js';

import type { AttentionItem } from './attention.js';

const NOW = Date.parse('2026-08-12T12:00:00Z');

const item = (over: Partial<AttentionItem> & { id: string }): AttentionItem => ({
  title: `Задача ${over.id}`,
  href: `/x/${over.id}`,
  severity: 'medium',
  ...over
});

describe('очередь «Разобрать» (CMP-013)', () => {
  it('критичное идёт первым независимо от типа элемента', () => {
    const sorted = sortByUrgency(
      [item({ id: 'a', severity: 'low' }), item({ id: 'b', severity: 'high' })],
      NOW
    );
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('при равной критичности вперёд идёт то, у чего срок ближе', () => {
    const sorted = sortByUrgency(
      [
        item({ id: 'later', dueAt: '2026-08-20T00:00:00Z' }),
        item({ id: 'sooner', dueAt: '2026-08-13T00:00:00Z' })
      ],
      NOW
    );
    expect(sorted.map((i) => i.id)).toEqual(['sooner', 'later']);
  });

  it('элементы без срока не вытесняют срочные', () => {
    const sorted = sortByUrgency(
      [item({ id: 'no-date' }), item({ id: 'dated', dueAt: '2026-08-13T00:00:00Z' })],
      NOW
    );
    expect(sorted.map((i) => i.id)).toEqual(['dated', 'no-date']);
  });

  it('порядок стабилен, когда сравнивать нечем — список не прыгает между обновлениями', () => {
    const first = sortByUrgency([item({ id: 'b' }), item({ id: 'a' })]);
    const second = sortByUrgency([item({ id: 'a' }), item({ id: 'b' })]);
    expect(first.map((i) => i.id)).toEqual(second.map((i) => i.id));
  });

  it('исходный массив не мутируется', () => {
    const source = [item({ id: 'a', severity: 'low' }), item({ id: 'b', severity: 'high' })];
    sortByUrgency(source);
    expect(source.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('просрочка определяется по сроку, а не по статусу', () => {
    expect(isOverdue(item({ id: 'x', dueAt: '2026-08-01T00:00:00Z' }), NOW)).toBe(true);
    expect(isOverdue(item({ id: 'x', dueAt: '2026-09-01T00:00:00Z' }), NOW)).toBe(false);
    expect(isOverdue(item({ id: 'x' }), NOW)).toBe(false);
  });

  it('битая дата не считается просрочкой', () => {
    expect(isOverdue(item({ id: 'x', dueAt: 'не дата' }), NOW)).toBe(false);
  });
});
