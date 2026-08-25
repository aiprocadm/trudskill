import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { roleBlueprints } from '../features/navigation/role-blueprints';

/**
 * Роль из чертежа меню должна существовать в базе.
 *
 * Журнал 21: роли `teacher` нет ни в одной живой базе — ни в разработке, ни на стенде, —
 * а в коде для неё есть чертёж короткого меню и набор частых задач. Такая роль выглядит
 * работающей: она перечислена в интерфейсе, покрыта тестами, названа в ТЗ — и при этом
 * ни один человек её получить не может.
 *
 * Тест сверяет чертежи с ролями, которые заводят миграции. Он не ходит в базу (в обычном
 * прогоне PostgreSQL нет) — читает SQL: это ловит именно расхождение «код знает роль,
 * которую никто не создаёт».
 *
 * ⚠️ Роли, которых в миграциях нет, перечислены ниже **с причиной**. Пустой список
 * недопустим по той же причине, по какой недопустимо молчаливое исключение: решение
 * «роль будет позже» должно быть видно, а не подразумеваться.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', '..', '..', '..', 'apps', 'backend', 'migrations');

/** Роль → почему её нет в миграциях. Снимается, когда роль заведут. */
const PLANNED_ROLES: Record<string, string> = {
  /*
   * Пусто — и это правильное состояние. Роль преподавателя заведена миграцией
   * 0084 (решение принято в срезе 54): методист собирает программу, а преподаватель
   * проверяет работы конкретных людей и видит их персональные данные — это разная
   * работа и разный доступ.
   */
};

const rolesFromMigrations = (): Set<string> => {
  const codes = new Set<string>();
  if (!existsSync(MIGRATIONS)) return codes;
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const statements = sql.split(/;\s*(?:\r?\n|$)/);
    for (const statement of statements) {
      if (!statement.toLowerCase().includes('into iam.roles')) continue;
      // Коды ролей — строковые литералы вида 'tenant_admin' внутри VALUES.
      for (const m of statement.matchAll(/'([a-z_]{3,30})'/g)) codes.add(m[1] as string);
    }
  }
  return codes;
};

describe('роль из чертежа меню существует в базе', () => {
  it('миграции вообще заводят роли — иначе сверять не с чем', () => {
    expect(rolesFromMigrations().size).toBeGreaterThan(3);
  });

  it('у каждой роли чертежа есть либо миграция, либо объяснение', () => {
    const known = rolesFromMigrations();
    const orphans = roleBlueprints
      .map((blueprint) => blueprint.role)
      .filter((role) => !known.has(role))
      .filter((role) => !(role in PLANNED_ROLES));

    expect(
      orphans,
      `в коде есть меню для ролей, которых никто не создаёт:\n${orphans.join('\n')}\n` +
        'Либо заведите роль миграцией, либо впишите в PLANNED_ROLES с причиной.'
    ).toEqual([]);
  });

  it('в списке ожидаемых нет ролей, которые уже завели', () => {
    const known = rolesFromMigrations();
    const stale = Object.keys(PLANNED_ROLES).filter((role) => known.has(role));

    expect(stale, `эти роли уже заводятся миграцией — вычеркните их:\n${stale.join('\n')}`).toEqual(
      []
    );
  });
});
