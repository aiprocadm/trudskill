import { describe, expect, it } from 'vitest';

import { parseNormalizedCollections } from './normalized-collections.js';

/**
 * Флаг чтения по коллекциям (Фаза 1, РМ32). Пустое значение — точка отката всей фазы;
 * опечатка — ошибка конфигурации, а не тихое чтение из снимка.
 */
describe('LMS_NORMALIZED_COLLECTIONS', () => {
  it('пусто — ни одна коллекция не читается из таблиц', () => {
    expect(parseNormalizedCollections('')).toEqual(new Set());
    expect(parseNormalizedCollections(' , ')).toEqual(new Set());
  });

  it('перечисление через запятую с пробелами', () => {
    expect(parseNormalizedCollections('groups, counterparties')).toEqual(
      new Set(['groups', 'counterparties'])
    );
  });

  it('коллекция, для которой репозитория ещё нет, — понятная ошибка', () => {
    expect(() => parseNormalizedCollections('groups,generatedDocuments')).toThrow(
      /«generatedDocuments» не читается из таблиц; допустимы: counterparties, groups, learners, enrollments, groupCourses, examResults/
    );
  });
});
