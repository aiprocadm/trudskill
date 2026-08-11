import { describe, expect, it } from 'vitest';

import { navigationModel } from './model';
import {
  NAV_GROUPS,
  buildMoreSections,
  getGroupedNavigation,
  resolveGroupForPath
} from './nav-groups';

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
      // ФТ-D6: библиотека платформы стоит сразу за курсами — методист приходит за
      // готовой программой туда же, где заводит свои.
      '/library',
      '/materials',
      '/scorm',
      '/directions',
      '/admin/webinars'
    ]);
  });

  it('порядок блоков соответствует исходному порядку NAV_GROUPS (порядок ТЗ)', () => {
    // tenant.read освещает несколько несоседних блоков (overview … settings).
    const ids = getGroupedNavigation(sessionWith(['tenant.read'])).map((g) => g.id);
    // getGroupedNavigation не должен переупорядочивать блоки: результат — это NAV_GROUPS
    // в исходном порядке, суженный до непустых блоков.
    const expectedOrder = NAV_GROUPS.map((g) => g.id).filter((id) => ids.includes(id));
    expect(ids).toEqual(expectedOrder);
    // Содержательный якорь: блок «Обзор» идёт раньше блока «Настройки и система».
    expect(ids).toContain('overview');
    expect(ids).toContain('settings');
    expect(ids.indexOf('overview')).toBeLessThan(ids.indexOf('settings'));
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

describe('buildMoreSections (IA-015)', () => {
  it('раскладывает пункты по блокам ИА и сохраняет порядок блока', () => {
    const sections = buildMoreSections([
      { href: '/materials', label: 'Материалы' },
      { href: '/courses', label: 'Курсы' },
      { href: '/audit', label: 'Журнал действий' }
    ]);
    const courses = sections.find((section) => section.id === 'courses');
    // Порядок берётся из NAV_GROUPS.hrefs, а не из порядка входного массива.
    expect(courses?.items.map((item) => item.href)).toEqual(['/courses', '/materials']);
  });

  it('не возвращает пустые блоки', () => {
    const sections = buildMoreSections([{ href: '/audit', label: 'Журнал действий' }]);
    expect(sections.every((section) => section.items.length > 0)).toBe(true);
  });

  it('пункт вне десяти блоков не теряется', () => {
    const sections = buildMoreSections([{ href: '/unknown-route', label: 'Неизвестный' }]);
    const all = sections.flatMap((section) => section.items.map((item) => item.href));
    expect(all).toContain('/unknown-route');
  });

  it('пустой вход даёт пустой второй уровень', () => {
    expect(buildMoreSections([])).toEqual([]);
  });
});
