/**
 * Экран «Эксплуатация» (ФТ-I2, Фаза 6 Task 8).
 *
 * Дом не монтирует React в тестах (нет RTL), поэтому «E2E» здесь — это:
 *  - доступ к маршруту и видимость пункта меню по правам;
 *  - smoke-импорт экрана, чтобы поймать сломанный импорт или синтаксис;
 *  - проверка, что таблицы строятся через DataTable — иначе на телефоне пропадёт
 *    карточный режим (правило про 360px в CLAUDE.md).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const admin: UserSession = {
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
  permissions: ['operations.quarantine.read', 'operations.quarantine.write']
};

/** Методист ведёт содержание курсов; разбирать застрявшие выпуски — не его работа. */
const methodist: UserSession = {
  ...admin,
  roles: ['methodist'],
  permissions: ['courses.write', 'documents.read']
};

describe('доступ к экрану «Эксплуатация»', () => {
  it('открыт администрации, закрыт методисту, гостя уводит на вход', () => {
    expect(evaluateRouteAccess('/admin/operations', admin)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/operations', methodist)).toEqual({ kind: 'forbidden' });
    expect(evaluateRouteAccess('/admin/operations', null)).toEqual({ kind: 'redirect-login' });
  });

  it('пункт меню виден только тем, кто может им пользоваться', () => {
    expect(getVisibleNavigation(admin).map((i) => i.href)).toContain('/admin/operations');
    expect(getVisibleNavigation(methodist).map((i) => i.href)).not.toContain('/admin/operations');
  });
});

describe('экран собирается', () => {
  it('модуль импортируется и отдаёт компонент', async () => {
    const mod = await import('../features/operations/operations-screen');
    expect(typeof mod.OperationsScreen).toBe('function');
  });
});

describe('телефон 360px (ФТ-H4)', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../features/operations/operations-screen.tsx'),
    'utf8'
  );

  it('все три таблицы строятся через DataTable, а не самодельной разметкой', () => {
    // Своя <table> потеряла бы карточный режим на ≤480px: подписи ячеек берутся из
    // заголовков колонок DataTable.
    expect((source.match(/<DataTable</g) ?? []).length).toBe(3);
    expect(source).not.toContain('<table');
  });

  it('у каждой колонки есть заголовок — из него берётся подпись карточки', () => {
    // Колонка без title дала бы на телефоне карточку с безымянным полем.
    const columnLines = source
      .split('\n')
      .map((line) => line.trim())
      // Строки вкладок тоже начинаются с `{ key:` — у них `label`, а не `title`.
      .filter((line) => line.startsWith("{ key: '") && !line.includes('label:'));

    expect(columnLines.length).toBeGreaterThanOrEqual(15);
    for (const line of columnLines) {
      expect(line, `колонка без заголовка: ${line}`).toContain('title:');
    }
  });

  it('вкладки переносятся по строкам и не тянут страницу вширь', () => {
    expect(source).toContain("flexWrap: 'wrap'");
  });
});
