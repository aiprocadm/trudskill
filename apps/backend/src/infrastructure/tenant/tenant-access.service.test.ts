import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantAccessService } from './tenant-access.service.js';

import type { DatabaseService } from '../database/database.service.js';

/**
 * Статус арендатора, который кто-то проверяет (журнал 337).
 *
 * `core.tenants.status` объявлен жизненным циклом `trial | active | suspended | archived`
 * (0072), биллинг переводит неплательщика в `suspended`, платформенная админка — в `archived`,
 * и документы проекта пишут «suspended отключает арендатора». А отключал его никто: вход,
 * magic-link, ЕСИА и обновление сессии в `core.tenants` не заглядывали вовсе. Приостановленный
 * за неуплату центр работал как ни в чём не бывало — только ночные рассылки его пропускали.
 *
 * Здесь — единственное место, где статус превращается в решение «выдавать ли сессию».
 */

const MIGRATION_0072 = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations/0072_core_tenants_status_check.sql'
);

/** Статусы из CHECK-ограничения — читаем из самой миграции, а не переписываем из головы. */
const statusesFromMigration = (): string[] => {
  const sql = readFileSync(MIGRATION_0072, 'utf8');
  const check = /CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)\s*\)/i.exec(sql)?.[1];
  if (!check) throw new Error('в 0072 не найден CHECK (status IN (...))');
  return [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
};

function makeDb(rows: unknown[]) {
  const query = vi.fn(async () => rows);
  return { db: { query } as unknown as DatabaseService, query };
}

describe('статус арендатора решает, выдавать ли сессию', () => {
  it('сторож: у каждого статуса из CHECK 0072 есть явное решение — и лишних решений нет', () => {
    // Новый статус в базе без решения здесь — это статус, который «по умолчанию пускает».
    // Именно так `suspended` и жил: объявлен в CHECK, а решения о входе не имел.
    expect(Object.keys(TenantAccessService.SESSION_DECISION).sort()).toEqual(
      statusesFromMigration().sort()
    );
  });

  it('trial и active — пропускает', async () => {
    for (const status of ['trial', 'active']) {
      const { db } = makeDb([{ status }]);
      await expect(
        new TenantAccessService(db).assertAcceptsSessions('t1')
      ).resolves.toBeUndefined();
    }
  });

  it('suspended — отказ с кодом tenant_suspended', async () => {
    const { db } = makeDb([{ status: 'suspended' }]);
    await expect(new TenantAccessService(db).assertAcceptsSessions('t1')).rejects.toMatchObject({
      response: { code: 'tenant_suspended' }
    });
  });

  it('archived — отказ с кодом tenant_archived', async () => {
    const { db } = makeDb([{ status: 'archived' }]);
    const error = await new TenantAccessService(db).assertAcceptsSessions('t1').catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ code: 'tenant_archived' });
  });

  it('неизвестный статус — отказ, а не пропуск: неизвестное не держит арендатора работающим', async () => {
    // Та же логика, что нормализация мусора в 0072: мусор → suspended, не → active.
    const { db } = makeDb([{ status: 'whatever' }]);
    await expect(new TenantAccessService(db).assertAcceptsSessions('t1')).rejects.toMatchObject({
      response: { code: 'tenant_suspended' }
    });
  });

  it('арендатора нет в базе — отказ tenant_not_found', async () => {
    const { db } = makeDb([]);
    await expect(new TenantAccessService(db).assertAcceptsSessions('t1')).rejects.toMatchObject({
      response: { code: 'tenant_not_found' }
    });
  });

  it('без базы (память, тесты) — молчит: гейт, который не может посмотреть, не запрещает', async () => {
    await expect(new TenantAccessService().assertAcceptsSessions('t1')).resolves.toBeUndefined();
  });

  it('спрашивает статус параметризованным запросом по идентификатору арендатора', async () => {
    const { db, query } = makeDb([{ status: 'active' }]);
    await new TenantAccessService(db).assertAcceptsSessions('t1');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/from core\.tenants/);
    expect(sql).not.toContain('t1');
    expect(params).toEqual(['t1']);
  });
});
