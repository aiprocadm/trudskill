import { describe, expect, it } from 'vitest';

import { selectionState, toggleAll, toggleKey } from './selection.js';

describe('выделение строк реестра (CMP-001)', () => {
  it('toggleKey добавляет невыделенный ключ', () => {
    expect(toggleKey(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('toggleKey убирает выделенный ключ', () => {
    expect(toggleKey(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('toggleKey не мутирует исходный массив', () => {
    const initial = ['a'];
    toggleKey(initial, 'b');
    expect(initial).toEqual(['a']);
  });

  it('toggleAll при частичном выделении выделяет всё видимое', () => {
    expect(toggleAll(['a'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('toggleAll при полном выделении снимает выделение', () => {
    expect(toggleAll(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('toggleAll сохраняет выделение строк с других страниц', () => {
    // Выделение живёт по ключам, а страница показывает только часть строк: снимая
    // «выделить все» на второй странице, нельзя молча терять выбранное на первой.
    expect(toggleAll(['x', 'a', 'b'], ['a', 'b'])).toEqual(['x']);
  });

  it('selectionState различает три состояния', () => {
    expect(selectionState([], ['a', 'b'])).toBe('none');
    expect(selectionState(['a'], ['a', 'b'])).toBe('some');
    expect(selectionState(['a', 'b'], ['a', 'b'])).toBe('all');
  });

  it('пустая таблица не считается полностью выделенной', () => {
    // Иначе чекбокс в шапке пустого реестра показывает «выделено всё».
    expect(selectionState([], [])).toBe('none');
  });

  it('выделение с других страниц не делает текущую страницу выделенной', () => {
    expect(selectionState(['x'], ['a', 'b'])).toBe('none');
  });
});
