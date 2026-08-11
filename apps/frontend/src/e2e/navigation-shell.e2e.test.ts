import { describe, expect, it } from 'vitest';

import { getNavigationView, getVisibleNavigation } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';
import { buildMoreSections } from '../features/navigation/nav-groups';

import type { UserSession } from '../entities/session/model';

/*
 * IA-019. До Фазы 1 редизайна этот файл проверял только то, что два модуля импортируются:
 * инварианта сайдбара здесь не было вовсе, хотя ТЗ §4.8 исходило из обратного. Каркас можно
 * было сломать, не уронив ни одного теста. Теперь сторож держит бюджет меню и полноту
 * второго уровня — расхождение записано в журнал docs/TZ_UI_REDESIGN_STATUS.md.
 */
const fullAdmin: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: navigationModel.flatMap((item) => item.requiredPermissions ?? [])
};

describe('каркас навигации', () => {
  it('AppShell импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/app-shell');
    expect(typeof mod.AppShell).toBe('function');
  });

  it('CommandPalette импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/command-palette');
    expect(typeof mod.CommandPalette).toBe('function');
  });

  it('в главном меню не больше семи пунктов', () => {
    expect(getNavigationView(fullAdmin).main.length).toBeLessThanOrEqual(7);
  });

  it('всё, что не попало в главное меню, доступно во втором уровне', () => {
    const view = getNavigationView(fullAdmin);
    const inMore = new Set(
      buildMoreSections(view.more).flatMap((section) => section.items.map((item) => item.href))
    );
    for (const item of view.more) {
      expect(inMore, item.href).toContain(item.href);
    }
  });

  it('ни один доступный по правам раздел не исчезает из меню целиком', () => {
    const view = getNavigationView(fullAdmin);
    const shown = new Set([...view.main, ...view.more].map((item) => item.href));
    for (const item of getVisibleNavigation(fullAdmin)) {
      expect(shown, item.href).toContain(item.href);
    }
  });
});
