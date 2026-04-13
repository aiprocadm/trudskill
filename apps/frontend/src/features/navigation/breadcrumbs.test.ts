import { describe, expect, it } from 'vitest';

import { buildBreadcrumbs } from './breadcrumbs';

describe('buildBreadcrumbs', () => {
  it('returns single crumb for home', () => {
    expect(buildBreadcrumbs('/')).toEqual([{ label: 'Главная', href: '/' }]);
  });

  it('uses navigation labels for known paths', () => {
    const crumbs = buildBreadcrumbs('/courses');
    expect(crumbs).toEqual([
      { label: 'Главная', href: '/' },
      { label: 'Курсы', href: '/courses' }
    ]);
  });

  it('builds nested path with segment fallbacks', () => {
    const crumbs = buildBreadcrumbs('/courses/new');
    expect(crumbs[0]).toEqual({ label: 'Главная', href: '/' });
    expect(crumbs[1]).toEqual({ label: 'Курсы', href: '/courses' });
    expect(crumbs[2]).toEqual({ label: 'Создание', href: '/courses/new' });
  });

  it('labels UUID-like last segment as card', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const crumbs = buildBreadcrumbs(`/users/${id}`);
    expect(crumbs.at(-1)).toEqual({ label: 'Карточка', href: `/users/${id}` });
  });
});
