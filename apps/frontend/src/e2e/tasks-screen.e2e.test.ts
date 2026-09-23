import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSIONS } from './role-permissions.fixture';
import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

/**
 * Экран задач (ТЗ перехода с CDOPROF, МГ-G2.3): маршрут `/tasks` открывается правом
 * `tasks.read`, пункт «Задачи» виден сотрудникам и не виден слушателю с представителем.
 * Без отрисовки React — как все e2e фронта: доступ, меню и динамический импорт экрана.
 */
const sessionWith = (permissions: string[], roles = ['curator']): UserSession =>
  ({
    user: { id: 'u_1', tenantId: 'tenant_demo', login: 'x', status: 'active', displayName: 'x' },
    tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
    roles,
    permissions
  }) as unknown as UserSession;

describe('экран «Задачи» (/tasks)', () => {
  it('маршрут открывается правом tasks.read, без него — запрет, без сессии — вход', () => {
    expect(evaluateRouteAccess('/tasks', sessionWith(['tasks.read']))).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/tasks', sessionWith(['learners.read']))).toEqual({
      kind: 'forbidden'
    });
    expect(evaluateRouteAccess('/tasks', null)).toEqual({ kind: 'redirect-login' });
  });

  it('пункт «Задачи» есть у ролей с tasks.read и отсутствует у слушателя и представителя', () => {
    for (const role of ['curator', 'manager', 'methodist', 'teacher', 'tenant_admin']) {
      const hrefs = getVisibleNavigation(sessionWith([...ROLE_PERMISSIONS[role]!], [role])).map(
        (item) => item.href
      );
      expect(hrefs, role).toContain('/tasks');
    }
    for (const role of ['learner', 'counterparty_rep']) {
      const hrefs = getVisibleNavigation(sessionWith([...ROLE_PERMISSIONS[role]!], [role])).map(
        (item) => item.href
      );
      expect(hrefs, role).not.toContain('/tasks');
    }
  });

  it('экран собирается и экспортирует компонент', async () => {
    const mod = await import('../features/tasks/tasks-list-screen');
    expect(typeof mod.TasksListScreen).toBe('function');
  });
});
