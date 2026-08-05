import { describe, expect, it } from 'vitest';

import { resolveRouteMeta } from './helpers';
import { ROLE_HOME_ROUTES, normalizeRoleCode, resolveRoleHome } from './role-home';

import type { UserSession } from '../../entities/session/model';

const session = (roles: string[], permissions: string[] = []): UserSession => ({
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'u1',
    email: null,
    status: 'active',
    displayName: 'U1'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles,
  permissions
});

/** Всё разрешено — проверяем выбор маршрута отдельно от проверки прав. */
const allowAll = () => true;

describe('resolveRoleHome (ФТ-H2, Фаза 5 Task 1)', () => {
  it('каждая роль системы приземляется на свой экран', () => {
    const expected: Record<string, string> = {
      learner: '/learner',
      counterparty_rep: '/counterparty-portal',
      tenant_admin: '/workspace',
      platform_admin: '/workspace',
      methodist: '/courses',
      manager: '/groups'
    };

    for (const [role, href] of Object.entries(expected)) {
      expect(resolveRoleHome(session([role]), allowAll)).toBe(href);
    }
  });

  it('роли без домашнего экрана оставляют витрину — а не пустую страницу', () => {
    expect(resolveRoleHome(session(['неведомая_роль']), allowAll)).toBeNull();
  });

  it('без сессии вести некуда', () => {
    expect(resolveRoleHome(null, allowAll)).toBeNull();
  });

  it('синонимы ролей распознаются', () => {
    expect(resolveRoleHome(session(['student']), allowAll)).toBe('/learner');
    expect(resolveRoleHome(session(['Admin']), allowAll)).toBe('/workspace');
    expect(resolveRoleHome(session(['methodologist']), allowAll)).toBe('/courses');
  });

  it('при нескольких ролях выигрывает более ранняя в таблице', () => {
    // Так вело себя перенаправление до правки: слушатель важнее рабочей роли.
    expect(resolveRoleHome(session(['tenant_admin', 'learner']), allowAll)).toBe('/learner');
  });

  it('недоступный маршрут пропускается, а не выбрасывает на «доступ запрещён»', () => {
    // Права роли могли измениться миграцией. Перенаправление на закрытую страницу
    // сразу после входа выглядело бы как поломка входа.
    const denyWorkspace = (href: string) => href !== '/workspace';
    expect(resolveRoleHome(session(['tenant_admin']), denyWorkspace)).toBeNull();
    // При наличии второй роли берётся её маршрут, а не отказ.
    expect(resolveRoleHome(session(['tenant_admin', 'manager']), denyWorkspace)).toBe('/groups');
  });

  it('проверка прав по умолчанию настоящая: без прав маршрут не выбирается', () => {
    // Резолвер вызывается БЕЗ подмены `canAccess` — работает реальный evaluateRouteAccess.
    expect(resolveRoleHome(session(['manager'], []))).toBeNull();
    expect(resolveRoleHome(session(['manager'], ['groups.read']))).toBe('/groups');
  });

  it('слушатель доходит до кабинета — маршрут `/learner` есть в карте доступа', () => {
    // Регрессия: записи `/learner` в карте не было вовсе. Неизвестный маршрут считается
    // «не найден», а `ProtectedRoute` на этом уводит на `/not-found` — то есть слушатель
    // выпадал из собственного кабинета сразу после входа.
    expect(resolveRoleHome(session(['learner'], ['enrollments.read']))).toBe('/learner');
  });

  it('запись `/learner` не перехватывает внутренние страницы кабинета', () => {
    // Совпадение ищется по префиксу и берётся первое: стой `/learner` выше своих
    // подстраниц — все они унаследовали бы его право.
    expect(resolveRouteMeta('/learner/payments')?.requiredPermissions).toEqual([
      'payments.self_purchase'
    ]);
    expect(resolveRouteMeta('/learner/courses')?.requiredPermissions).toEqual(['enrollments.read']);
    expect(resolveRouteMeta('/learner/identity')).not.toBeNull();
  });

  it('домашний маршрут каждой роли открывается её собственным правом', () => {
    // Сторож против расхождения таблицы с картой доступа: у роли ровно то право,
    // которое ей выдаёт миграция, — и этого должно хватать, чтобы дойти до дома.
    const byRole: Array<[string, string[], string]> = [
      ['counterparty_rep', ['portal.read'], '/counterparty-portal'],
      ['tenant_admin', ['tenant.read'], '/workspace'],
      ['platform_admin', ['tenant.read'], '/workspace'],
      ['methodist', ['courses.read'], '/courses'],
      ['manager', ['groups.read'], '/groups']
    ];
    for (const [role, permissions, href] of byRole) {
      expect(resolveRoleHome(session([role], permissions))).toBe(href);
    }
  });

  it('таблица не содержит дублей ролей — иначе приоритет читался бы неоднозначно', () => {
    const roles = ROLE_HOME_ROUTES.map((entry) => entry.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('нормализация приводит регистр и синонимы к коду роли', () => {
    expect(normalizeRoleCode('STUDENT')).toBe('learner');
    expect(normalizeRoleCode('manager')).toBe('manager');
  });
});
