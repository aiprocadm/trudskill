import { describe, expect, it } from 'vitest';

import { navigationModel } from './model';
import { NAV_GROUPS, getGroupedNavigation, resolveGroupForPath } from './nav-groups';

import type { UserSession } from '../../entities/session/model';

const sessionWith = (permissions: string[]): UserSession => ({
  user: {
    id: 'u',
    tenantId: 't',
    login: 'l',
    email: null,
    status: 'active',
    displayName: 'U'
  },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
  roles: [],
  permissions
});

describe('NAV_GROUPS', () => {
  it('ровно 10 блоков с уникальными id', () => {
    expect(NAV_GROUPS).toHaveLength(10);
    expect(new Set(NAV_GROUPS.map((g) => g.id)).size).toBe(10);
  });

  it('каждый пункт меню принадлежит ровно одному блоку (нет сирот и дублей)', () => {
    const membership = (href: string) =>
      NAV_GROUPS.filter((g) => g.hrefs.includes(href)).map((g) => g.id);
    const problems = navigationModel
      .map((item) => ({ href: item.href, groups: membership(item.href) }))
      .filter((row) => row.groups.length !== 1);
    expect(problems).toEqual([]);
  });
});

describe('getGroupedNavigation', () => {
  it('null-сессия → пустой массив групп', () => {
    expect(getGroupedNavigation(null)).toEqual([]);
  });

  it('пустые блоки (все пункты отфильтрованы правами) не рендерятся', () => {
    const groups = getGroupedNavigation(sessionWith(['courses.read']));
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('courses');
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(ids).not.toContain('people');
  });

  it('порядок пунктов внутри блока следует порядку hrefs блока', () => {
    const groups = getGroupedNavigation(
      sessionWith(['courses.read', 'materials.read', 'directions.read', 'webinars.read'])
    );
    const courses = groups.find((g) => g.id === 'courses');
    expect(courses?.items.map((i) => i.href)).toEqual([
      '/courses',
      '/materials',
      '/scorm',
      '/directions',
      '/admin/webinars'
    ]);
  });
});

describe('resolveGroupForPath', () => {
  it('точный путь пункта → его блок', () => {
    expect(resolveGroupForPath('/courses')?.id).toBe('courses');
  });

  it('вложенный путь (деталь) → блок родителя по длиннейшему префиксу', () => {
    expect(resolveGroupForPath('/admin/tests/123')?.id).toBe('assessment');
  });

  it('длиннейший префикс побеждает: /academy/commission → documents, не settings', () => {
    expect(resolveGroupForPath('/academy/commission')?.id).toBe('documents');
    expect(resolveGroupForPath('/academy/requisites')?.id).toBe('settings');
  });

  it('неизвестный путь → null', () => {
    expect(resolveGroupForPath('/nope/here')).toBeNull();
  });
});
