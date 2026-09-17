import { describe, expect, it } from 'vitest';

import {
  OBJECT_CRUMB_FAILED,
  OBJECT_CRUMB_MISSING,
  buildBreadcrumbs,
  looksLikeId
} from './breadcrumbs';

/**
 * Крошки: Блок → Раздел → Имя объекта (ТЗ «Стабилизация, UX и развитие», 3.5 / Н5).
 */
describe('buildBreadcrumbs', () => {
  it('на диспетчере входа крошек нет — «Главная» была вторым именем домашнего раздела', () => {
    expect(buildBreadcrumbs('/')).toEqual([]);
    expect(buildBreadcrumbs('/courses').map((c) => c.href)).not.toContain('/');
  });

  it('раздел из меню: блок без ссылки, затем раздел', () => {
    expect(buildBreadcrumbs('/courses')).toEqual([
      { label: 'Курсы и контент' },
      { label: 'Курсы', href: '/courses' }
    ]);
  });

  it('страница без пункта меню называется своим заголовком, а не словом-сегментом', () => {
    /* Раньше `new` было «Создание» и для курса, и для группы — словарь по сегментам не умел иначе. */
    expect(buildBreadcrumbs('/courses/new').at(-1)).toEqual({
      label: 'Создание курса',
      href: '/courses/new'
    });
    expect(buildBreadcrumbs('/groups/new').at(-1)).toEqual({
      label: 'Новая группа',
      href: '/groups/new'
    });
  });

  it('служебные сегменты адреса не печатаются', () => {
    const labels = (path: string) => buildBreadcrumbs(path).map((c) => c.label);
    expect(labels('/admin/bulk-enrollments')).not.toContain('admin');
    expect(labels('/platform/tenants')).toEqual(['Настройки и система', 'Арендаторы платформы']);
    expect(labels('/esign/applications')).not.toContain('esign');
    expect(labels('/learning/calendar')).not.toContain('learning');
  });

  it('карточка: последняя крошка — имя объекта с сервера', () => {
    const crumbs = buildBreadcrumbs('/groups/group_9z34wx1b', {
      status: 'ready',
      name: 'Группа 360px'
    });
    expect(crumbs).toEqual([
      { label: 'Люди и группы' },
      { label: 'Группы', href: '/groups' },
      { label: 'Группа 360px', href: '/groups/group_9z34wx1b' }
    ]);
  });

  it('пока имя едет — скелетон, а не «Карточка» и не идентификатор', () => {
    const last = buildBreadcrumbs('/learners/learner_89ydse8s').at(-1);
    expect(last).toEqual({ label: '', href: '/learners/learner_89ydse8s', pending: true });
    expect(buildBreadcrumbs('/users/550e8400-e29b-41d4-a716-446655440000').at(-1)?.pending).toBe(
      true
    );
  });

  it('объекта нет или он не загрузился — крошка говорит это, а не крутится вечно', () => {
    expect(buildBreadcrumbs('/groups/group_1', { status: 'missing' }).at(-1)?.label).toBe(
      OBJECT_CRUMB_MISSING
    );
    expect(buildBreadcrumbs('/groups/group_1', { status: 'failed' }).at(-1)?.label).toBe(
      OBJECT_CRUMB_FAILED
    );
  });

  it('все идентификаторы и служебные слова вложенного адреса сворачиваются в одну крошку объекта', () => {
    /* Было: «Мои тесты / test_vc8sf4k5 / attempt / Карточка». */
    const crumbs = buildBreadcrumbs('/learner/tests/test_vc8sf4k5/attempt/attempt_1a2b3c4d', {
      status: 'ready',
      name: 'Охрана труда: итоговый тест'
    });
    expect(crumbs).toEqual([
      { label: 'Мой кабинет', href: '/learner' },
      { label: 'Мои тесты', href: '/learner/tests' },
      {
        label: 'Охрана труда: итоговый тест',
        href: '/learner/tests/test_vc8sf4k5/attempt/attempt_1a2b3c4d'
      }
    ]);
  });

  it('у кабинета слушателя своя иерархия — без блоков администратора', () => {
    /* Было: «Главная / Документы и удостоверения / Мой кабинет / Мои документы». */
    expect(buildBreadcrumbs('/learner/documents')).toEqual([
      { label: 'Мой кабинет', href: '/learner' },
      { label: 'Мои документы', href: '/learner/documents' }
    ]);
    expect(buildBreadcrumbs('/learner')).toEqual([{ label: 'Мой кабинет', href: '/learner' }]);
  });

  it('распознаёт родные и внешние форматы идентификаторов', () => {
    expect(looksLikeId('learner_89ydse8s')).toBe(true);
    expect(looksLikeId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(looksLikeId('courses')).toBe(false);
    expect(looksLikeId('module-empty')).toBe(false);
  });
});
