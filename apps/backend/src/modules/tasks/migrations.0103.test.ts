import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  resolve(HERE, '../../../migrations/0103_iam_tasks_permissions.sql'),
  'utf8'
);

/**
 * Миграция прав задач (ТЗ перехода с CDOPROF, §3/§12, решение РМ25): три права, выдача
 * сотрудникам, `manage_all` — администраторам и руководителю. Повторный запуск безопасен.
 */
describe('0103_iam_tasks_permissions', () => {
  it('заводит ровно три права tasks.*', () => {
    expect(sql).toContain("('p_tasks_read', 'tasks.read'");
    expect(sql).toContain("('p_tasks_write', 'tasks.write'");
    expect(sql).toContain("('p_tasks_manage_all', 'tasks.manage_all'");
    expect(
      (sql.match(/'tasks\.[a-z_]+'/g) ?? []).filter((c, i, a) => a.indexOf(c) === i)
    ).toHaveLength(3);
  });

  it('read+write — всем сотрудникам, manage_all — администраторам и руководителю', () => {
    const grants = sql.split('INSERT INTO iam.role_permissions').slice(1);
    expect(grants).toHaveLength(2);
    expect(grants[0]).toMatch(/p\.code IN \('tasks\.read', 'tasks\.write'\)/);
    expect(grants[0]).toMatch(
      /r\.code IN \('platform_admin', 'tenant_admin', 'manager', 'methodist', 'teacher', 'curator'\)/
    );
    expect(grants[1]).toMatch(/p\.code = 'tasks\.manage_all'/);
    expect(grants[1]).toMatch(/r\.code IN \('platform_admin', 'tenant_admin', 'manager'\)/);
    expect(grants[1]).not.toContain('curator');
  });

  it('идемпотентна: каждая вставка с ON CONFLICT DO NOTHING', () => {
    expect((sql.match(/ON CONFLICT/g) ?? []).length).toBe(3);
  });
});
