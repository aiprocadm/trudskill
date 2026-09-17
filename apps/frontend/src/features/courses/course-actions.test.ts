import { describe, expect, it } from 'vitest';

import { canArchiveCourse, courseHeaderAction } from './course-actions';

/** Действие карточки курса по состоянию (ТЗ 5.2 / Э2). */
describe('courseHeaderAction', () => {
  const rights = { canPublish: true, canCreateVersion: true };

  it('черновик — «Опубликовать курс»; без структуры кнопка выключена, но видна', () => {
    expect(courseHeaderAction({ status: 'draft', readyToPublish: true, ...rights })).toEqual({
      kind: 'publish',
      label: 'Опубликовать курс',
      disabled: false
    });
    expect(courseHeaderAction({ status: 'draft', readyToPublish: false, ...rights })).toEqual({
      kind: 'publish',
      label: 'Опубликовать курс',
      disabled: true
    });
  });

  it('опубликован — «Создать новую версию», а не «Опубликовать» вхолостую', () => {
    expect(courseHeaderAction({ status: 'published', readyToPublish: true, ...rights })).toEqual({
      kind: 'new_version',
      label: 'Создать новую версию'
    });
  });

  it('в архиве — главного действия нет', () => {
    expect(courseHeaderAction({ status: 'archived', readyToPublish: true, ...rights })).toBeNull();
  });

  it('без права действие скрывается, а не показывается выключенным', () => {
    expect(
      courseHeaderAction({
        status: 'draft',
        readyToPublish: true,
        canPublish: false,
        canCreateVersion: true
      })
    ).toBeNull();
    expect(
      courseHeaderAction({
        status: 'published',
        readyToPublish: true,
        canPublish: true,
        canCreateVersion: false
      })
    ).toBeNull();
  });

  it('«В архив» — только у живого курса и только с правом', () => {
    expect(canArchiveCourse('published', true)).toBe(true);
    expect(canArchiveCourse('archived', true)).toBe(false);
    expect(canArchiveCourse('draft', false)).toBe(false);
  });
});
