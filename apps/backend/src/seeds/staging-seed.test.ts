import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { STAGING_TENANT, isPlatformOnlyPermission, stagingSeedStatements } from './staging-seed.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');

/**
 * Права, которые миграции выдают ТОЛЬКО роли `platform_admin`, — по самим миграциям, а не по
 * памяти: появится новое платформенное право — тест узнает о нём без правки.
 */
const platformOnlyPermissionsFromMigrations = (): string[] => {
  const codes = new Set<string>();
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'))) {
    const sql = readFileSync(resolve(MIGRATIONS, file), 'utf8');
    for (const statement of sql.split(';')) {
      if (!/insert\s+into\s+iam\.role_permissions/i.test(statement)) continue;
      if (!/r\.code\s*=\s*'platform_admin'/i.test(statement)) continue;
      for (const match of statement.matchAll(/p\.code\s*(?:=\s*'([^']+)'|in\s*\(([^)]*)\))/gi)) {
        for (const code of (match[1] ?? match[2] ?? '').split(',')) {
          const trimmed = code.trim().replace(/^'|'$/g, '');
          if (trimmed) codes.add(trimmed);
        }
      }
    }
  }
  return [...codes].sort();
};

/**
 * ФТ-I3: «staging с сид-данными ДВУХ тенантов».
 *
 * Зачем именно двух. Изоляция арендаторов — требование уровня P0 (ФТ-D1), и она закрыта
 * тестами (`test:isolation`). Но на живом стенде проверить её было **нечем**: в базе жил
 * ровно один арендатор `tenant_demo`, созданный миграцией `0010`. Утечку между арендаторами
 * невозможно увидеть глазами там, где второго арендатора не существует.
 *
 * Второй арендатор заводится отдельным скриптом, а не миграцией: миграции применяются и в
 * проде, а демонстрационные данные там не нужны.
 */

describe('ФТ-I3 · сид второго арендатора для стенда', () => {
  it('арендатор отличается от демонстрационного и по идентификатору, и по коду', () => {
    expect(STAGING_TENANT.id).not.toBe('tenant_demo');
    expect(STAGING_TENANT.code).not.toBe('demo');
    // Название человеку видно в шапке — на стенде должно быть сразу понятно, где ты.
    expect(STAGING_TENANT.name).toMatch(/[А-Яа-яЁё]/);
  });

  it('каждая строка привязана к своему арендатору — чужого tenant_id в сиде нет', () => {
    const statements = stagingSeedStatements();
    const foreign = statements.filter((sql) => sql.includes('tenant_demo'));

    expect(foreign, `сид ссылается на чужого арендатора:\n${foreign.join('\n')}`).toEqual([]);
  });

  it('сид идемпотентен: повторный запуск ничего не ломает', () => {
    // Скрипт запускают на стенде руками и обычно не по одному разу.
    for (const sql of stagingSeedStatements()) {
      // Удаление с условием идемпотентно само по себе: второй раз ему просто нечего удалять.
      if (/^\s*delete\s/i.test(sql)) {
        expect(sql.toLowerCase(), `удаление без условия: ${sql}`).toContain('where');
        continue;
      }
      expect(sql.toLowerCase(), `не идемпотентно: ${sql}`).toContain('on conflict');
    }
  });

  it('у арендатора есть свой администратор — иначе в него нельзя войти', () => {
    const statements = stagingSeedStatements();
    const userInserts = statements.filter((sql) => sql.includes('iam.users'));

    expect(userInserts.length).toBeGreaterThan(0);
    expect(userInserts.join('\n')).toContain(STAGING_TENANT.id);
  });

  it('есть на что посмотреть: слушатель, группа и курс своего арендатора', () => {
    const sql = stagingSeedStatements().join('\n');

    expect(sql).toContain('learning.courses');
    expect(sql).toContain('learning.groups');
    expect(sql).toContain('learning.learners');
  });

  it('пароль стенда не пустой и задан хэшем, а не открытым текстом', () => {
    const sql = stagingSeedStatements().join('\n');

    expect(sql).not.toContain('Password123!');
    expect(sql).toMatch(/password_hash/);
  });

  it('журнал 336: сид не раздаёт арендатору права владельца платформы', () => {
    // Миграция 0073 прямо говорит: повторить «все права скопом» для tenant_admin — значит дать
    // каждому арендатору админку всех остальных. Ручки `platform/*` защищены только правом.
    const platformOnly = platformOnlyPermissionsFromMigrations();
    expect(platformOnly).toEqual(
      expect.arrayContaining(['platform.tenants.read', 'platform.impersonate', 'library.publish'])
    );
    const leaking = platformOnly.filter((code) => !isPlatformOnlyPermission(code));
    expect(leaking, 'миграции считают право платформенным, а сид его раздаёт').toEqual([]);

    const grants = stagingSeedStatements().filter(
      (sql) => sql.includes('iam.role_permissions') && /^\s*insert/i.test(sql)
    );
    expect(grants.length).toBeGreaterThan(0);
    for (const sql of grants) {
      expect(sql, 'выдача прав без исключения платформенных').toMatch(/not like 'platform\.%'/);
    }
  });

  it('журнал 336: уже выданные платформенные права у арендатора отбираются при повторном запуске', () => {
    // Стенд, засеянный до починки, уже носит эти строки — одного «не выдавать» мало.
    const revoke = stagingSeedStatements().find((sql) =>
      /^\s*delete\s+from\s+iam\.role_permissions/i.test(sql)
    );
    expect(revoke).toBeDefined();
    expect(revoke).toContain(STAGING_TENANT.id);
    expect(revoke).toMatch(/like 'platform\.%'/);
  });
});
