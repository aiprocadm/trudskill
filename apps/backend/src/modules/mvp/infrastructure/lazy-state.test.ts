import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { requireAt } from '../../../common/testing/require-at.test-util.js';

/**
 * Ленивая раскладка состояния (§12.1, 2026-08-09).
 *
 * ЗАЧЕМ. Обычный показ списка трогает одну-две коллекции из полусотни, но платил за все:
 * полторы тысячи записей раскладывались в массивы на каждый запрос, с расшифровкой ПДн всех
 * слушателей по пути. Замер: p95 при 50 сессиях был 0,79 с при требовании 0,3 с.
 *
 * Эти тесты — сторожа: правка, возвращающая жадную загрузку, их роняет.
 */
const makeRaw = () =>
  new Map<string, unknown[]>([
    ['learners', [{ id: 'l1', name: 'Иванов' }]],
    ['enrollments', [{ id: 'e1' }]],
    ['enrollmentStatusHistory', [{ id: 'h1' }, { id: 'h2' }]]
  ]);

describe('раскладывается только то, к чему обратились', () => {
  it('обращение к одной коллекции не трогает остальные', () => {
    const state = new InMemoryMvpState();
    const materialized: string[] = [];
    state.setRawSnapshot(makeRaw(), (collection, raw) => {
      materialized.push(collection);
      return [...raw];
    });

    // Показ списка слушателей: истории статусов и зачислений он не касается.
    expect(state.learners).toHaveLength(1);

    expect(materialized).toEqual(['learners']);
    expect(state.touchedCollections()).toEqual(['learners']);
  });

  it('повторное обращение не раскладывает заново', () => {
    const state = new InMemoryMvpState();
    let calls = 0;
    state.setRawSnapshot(makeRaw(), (_collection, raw) => {
      calls += 1;
      return [...raw];
    });

    state.learners.push({ id: 'l2' } as never);
    expect(state.learners).toHaveLength(2);

    // Ссылка на массив стабильна: сервисы мутируют его как раньше.
    expect(calls).toBe(1);
  });

  it('неизвестная коллекция отдаётся пустой, а не роняет запрос', () => {
    const state = new InMemoryMvpState();
    state.setRawSnapshot(new Map(), (_c, raw) => [...raw]);
    expect(state.learners).toEqual([]);
  });
});

describe('пишется только изменившееся', () => {
  it('нетронутая коллекция не считается изменённой', () => {
    const state = new InMemoryMvpState();
    state.setRawSnapshot(makeRaw(), (_c, raw) => [...raw]);

    expect(state.hasChanged('enrollmentStatusHistory')).toBe(false);
  });

  it('прочитанная, но не изменённая коллекция тоже не пишется', () => {
    // Это и есть случай обычного показа списка: прочитали и ничего не поменяли.
    const state = new InMemoryMvpState();
    state.setRawSnapshot(makeRaw(), (_c, raw) => [...raw]);

    expect(state.learners).toHaveLength(1);

    expect(state.hasChanged('learners')).toBe(false);
  });

  it('добавление записи делает коллекцию изменённой', () => {
    const state = new InMemoryMvpState();
    state.setRawSnapshot(makeRaw(), (_c, raw) => [...raw]);

    state.learners.push({ id: 'l2' } as never);

    expect(state.hasChanged('learners')).toBe(true);
  });

  it('правка внутри записи тоже видна', () => {
    const state = new InMemoryMvpState();
    state.setRawSnapshot(makeRaw(), (_c, raw) => [...raw]);

    (requireAt(state.learners, 0, 'слушатель снимка') as unknown as { name: string }).name =
      'Петров';

    expect(state.hasChanged('learners')).toBe(true);
  });

  it('присвоение коллекции целиком считается изменением', () => {
    const state = new InMemoryMvpState();
    state.setRawSnapshot(makeRaw(), (_c, raw) => [...raw]);

    state.learners = [];

    expect(state.hasChanged('learners')).toBe(true);
  });

  it('пометка «переписать обязательно» переживает совпадение отпечатка', () => {
    // Так помечаются старые строки с незашифрованными ПДн: в памяти они выглядят как
    // расшифрованные и по отпечатку сошли бы за «не менялись» — а перешифровать надо.
    const state = new InMemoryMvpState();
    state.setRawSnapshot(makeRaw(), (_c, raw) => [...raw]);

    state.markDirty('learners');
    expect(state.learners).toHaveLength(1);

    expect(state.hasChanged('learners')).toBe(true);
  });
});

describe('поштучные отпечатки проецируемых коллекций (Фаза 1, срез 1a)', () => {
  const rawGroups = () =>
    new Map<string, unknown[]>([
      [
        'groups',
        [
          { id: 'g1', code: 'G-1', name: 'Первая' },
          { id: 'g2', code: 'G-2', name: 'Вторая' }
        ]
      ],
      ['learners', [{ id: 'l1' }]]
    ]);

  it('отпечаток коллекции не изменился по форме: JSON.stringify всей коллекции', () => {
    const state = new InMemoryMvpState();
    state.setRawSnapshot(rawGroups(), (_c, raw) => [...raw]);
    expect(state.groups).toHaveLength(2);
    expect(state.hasChanged('groups')).toBe(false);
  });

  it('правка одной группы — в списке только она, удалённых нет', () => {
    const state = new InMemoryMvpState();
    state.setRawSnapshot(rawGroups(), (_c, raw) => [...raw]);
    (requireAt(state.groups, 1, 'группа') as unknown as { name: string }).name = 'Другая';

    expect(state.changedEntities('groups')).toEqual({
      upserted: [state.groups[1]],
      deletedIds: []
    });
    expect(state.hasChanged('groups')).toBe(true);
  });

  it('добавление и удаление видны поимённо', () => {
    const state = new InMemoryMvpState();
    state.setRawSnapshot(rawGroups(), (_c, raw) => [...raw]);
    state.groups.splice(0, 1);
    state.groups.push({ id: 'g3', code: 'G-3', name: 'Третья' } as never);

    expect(state.changedEntities('groups')).toEqual({
      upserted: [state.groups[1]],
      deletedIds: ['g1']
    });
  });

  it('присваивание целиком и markDirty — «всё», нетронутая — пусто', () => {
    const assigned = new InMemoryMvpState();
    assigned.setRawSnapshot(rawGroups(), (_c, raw) => [...raw]);
    assigned.groups = [];
    expect(assigned.changedEntities('groups')).toBe('all');

    const dirty = new InMemoryMvpState();
    dirty.setRawSnapshot(rawGroups(), (_c, raw) => [...raw]);
    dirty.markDirty('groups');
    expect(dirty.groups).toHaveLength(2);
    expect(dirty.changedEntities('groups')).toBe('all');

    const untouched = new InMemoryMvpState();
    untouched.setRawSnapshot(rawGroups(), (_c, raw) => [...raw]);
    expect(untouched.changedEntities('counterparties')).toEqual({ upserted: [], deletedIds: [] });
  });
});
