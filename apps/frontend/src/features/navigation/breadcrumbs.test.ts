import { describe, expect, it } from 'vitest';

import { buildBreadcrumbs } from './breadcrumbs';

describe('buildBreadcrumbs', () => {
  it('returns single crumb for home', () => {
    expect(buildBreadcrumbs('/')).toEqual([{ label: 'Главная', href: '/' }]);
  });

  it('uses navigation labels for known paths (with block crumb)', () => {
    expect(buildBreadcrumbs('/courses')).toEqual([
      { label: 'Главная', href: '/' },
      { label: 'Курсы и контент' },
      { label: 'Курсы', href: '/courses' }
    ]);
  });

  it('builds nested path with block + segment fallbacks', () => {
    const crumbs = buildBreadcrumbs('/courses/new');
    expect(crumbs[0]).toEqual({ label: 'Главная', href: '/' });
    expect(crumbs[1]).toEqual({ label: 'Курсы и контент' });
    expect(crumbs[2]).toEqual({ label: 'Курсы', href: '/courses' });
    expect(crumbs[3]).toEqual({ label: 'Создание', href: '/courses/new' });
  });

  it('inserts non-navigable block crumb (no href) as second item', () => {
    const crumbs = buildBreadcrumbs('/admin/tests/42');
    expect(crumbs[1]).toEqual({ label: 'Проверка и оценивание' });
    expect(crumbs[1]?.href).toBeUndefined();
  });

  it('labels UUID-like last segment as card', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const crumbs = buildBreadcrumbs(`/users/${id}`);
    expect(crumbs.at(-1)).toEqual({ label: 'Карточка', href: `/users/${id}` });
  });
});
