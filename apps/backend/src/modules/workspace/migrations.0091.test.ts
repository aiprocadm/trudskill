import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0091_iam_workspace_read.sql'),
  'utf-8'
);

/**
 * Журнал 342/343: рабочий стол сотрудника (`/workspace`) стоял под `tenant.read`, которое есть
 * у слушателя. Своего права «сотрудник центра» в модели не было — ни одно из выданных не
 * совпадало с набором «все роли центра, кроме слушателя и представителя заказчика».
 */
describe('миграция 0091 — право рабочего стола сотрудника', () => {
  it('заводит право workspace.read', () => {
    expect(SQL).toMatch(/\('p_workspace_read',\s*'workspace\.read',/);
  });

  it('выдаёт его всем ролям центра, кроме слушателя и представителя заказчика', () => {
    const grant = /WHERE r\.code IN \(([^)]*)\)/.exec(SQL);
    expect(grant, 'нет выдачи ролям').not.toBeNull();
    const roles = [...grant![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(roles).toEqual(['manager', 'methodist', 'platform_admin', 'teacher', 'tenant_admin']);
  });

  it('идемпотентна и атомарна: повторный прогон не падает, половинок не остаётся', () => {
    expect(SQL).toContain('ON CONFLICT (id) DO NOTHING');
    expect(SQL).toContain('ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING');
    expect(SQL).toMatch(/^BEGIN;/m);
    expect(SQL).toMatch(/^COMMIT;/m);
  });
});
