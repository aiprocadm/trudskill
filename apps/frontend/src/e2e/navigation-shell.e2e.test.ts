import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getNavigationView, getVisibleNavigation } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';

import type { UserSession } from '../entities/session/model';

/*
 * До Фазы 1 этот файл проверял ровно одно: что модуль оболочки импортируется.
 * Инвариантов у каркаса не было ни одного — при том что ТЗ §4.8 считало, будто
 * здесь охраняется структура сайдбара. Теперь охраняется.
 *
 * Пути — от файла, а не от process.cwd(): cwd различается между запуском из
 * корня и из apps/frontend (грабля из CLAUDE.md).
 */
const readShellSource = (name: string) =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), `../widgets/shell/${name}`),
    'utf8'
  );

const shellSource = readShellSource('app-shell.tsx');

/*
 * Администратор центра: в живой базе роли выданы ВСЕ права без исключения
 * (0010_iam_role_permissions_and_seed.sql:98-108 — join iam.permissions on true).
 * Поэтому сессия собирается из полного набора прав меню, а не из вручную
 * выписанного списка: иначе тест проверял бы выдуманную роль.
 */
const adminSession: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Админ'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: Array.from(
    new Set(navigationModel.flatMap((item) => item.requiredPermissions ?? []))
  )
};

describe('оболочка приложения', () => {
  it('AppShell импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/app-shell');
    expect(typeof mod.AppShell).toBe('function');
  });

  it('CommandPalette импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/command-palette');
    expect(typeof mod.CommandPalette).toBe('function');
  });

  it('GOAL-1: администратору видно не больше 7 пунктов сразу', () => {
    expect(getNavigationView(adminSession).main.length).toBeLessThanOrEqual(7);
  });

  it('GOAL-1: сокращение реально что-то сокращает — пунктов у роли заметно больше семи', () => {
    // Сторож самой метрики: если пунктов вдруг стало ≤7, проверка выше проходит
    // по построению и перестаёт что-либо доказывать.
    expect(getVisibleNavigation(adminSession).length).toBeGreaterThan(20);
  });

  it('GOAL-5: ни один видимый пункт не потерян — main + more покрывают всё', () => {
    const view = getNavigationView(adminSession);
    const shown = [...view.main, ...view.more].map((item) => item.href).sort();
    const visible = getVisibleNavigation(adminSession)
      .map((item) => item.href)
      .sort();
    expect(shown).toEqual(visible);
  });

  it('пункт не может оказаться одновременно в главном меню и в «Ещё»', () => {
    const view = getNavigationView(adminSession);
    const mainSet = new Set(view.main.map((item) => item.href));
    expect(view.more.filter((item) => mainSet.has(item.href))).toEqual([]);
  });

  it('IA-011: оболочка собирает меню через getNavigationView', () => {
    expect(shellSource).toContain('getNavigationView');
  });
});
