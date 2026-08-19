import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ФТ-D1 «изоляция до конца» — сторона, о которой легко забыть: изоляция ломается не только
 * чтением чужих данных, но и ЗАПИСЬЮ в общий ресурс.
 *
 * Каталог провайдеров интеграций (ФИС ФРДО, ЕИСОТ, почта, вебинары, прокторинг) —
 * ПЛАТФОРМЕННЫЙ справочник: у записи `Provider` нет поля арендатора, каталог один на всех.
 * Привязка учебного центра живёт отдельно — в учётных данных (`Credential`), и они как раз
 * скоупятся по арендатору правильно.
 *
 * Что было не так: изменяющие ручки каталога требовали право `integrations.write`, а оно
 * (проверено по живой базе `iam.role_permissions`) есть у `tenant_admin`. То есть
 * администратор ОДНОГО учебного центра мог переименовать или **выключить** провайдера,
 * общего для всех: выключил «ФИС ФРДО» — и выгрузки в надзор встали у ВСЕХ арендаторов.
 * Данные при этом не утекали, но один арендатор мог сломать работу остальным.
 *
 * Инвариант: читать каталог может арендатор, менять — только платформа.
 */

const CONTROLLER = resolve(dirname(fileURLToPath(import.meta.url)), 'integrations.controller.ts');

const PLATFORM_WRITE = 'platform.integrations.write';
const TENANT_READ = 'integrations.read';

interface Handler {
  route: string;
  method: string;
  permissions: string[];
}

/** Режет исходник контроллера на обработчики и вынимает объявленные права. */
const handlers = (): Handler[] => {
  const source = readFileSync(CONTROLLER, 'utf8');
  const decorator = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g;
  const found = [...source.matchAll(decorator)];
  return found.map((match, index) => {
    const start = match.index ?? 0;
    const end =
      index + 1 < found.length ? (found[index + 1]!.index ?? source.length) : source.length;
    const body = source.slice(start, end);
    const perms = [...body.matchAll(/@RequirePermissions\(([^)]*)\)/g)].flatMap((m) =>
      [...m[1]!.matchAll(/'([^']+)'/g)].map((p) => p[1]!)
    );
    return {
      method: match[1]!,
      route: (match[2] ?? '').replace(/['"]/g, ''),
      permissions: perms
    };
  });
};

const catalogHandlers = () => handlers().filter((h) => h.route.startsWith('providers'));

describe('платформенный каталог интеграций не меняется правом арендатора (ФТ-D1)', () => {
  it('в контроллере вообще есть ручки каталога — иначе тест проверяет пустоту', () => {
    expect(catalogHandlers().length).toBeGreaterThanOrEqual(6);
  });

  /*
   * Ключевая проверка. Любая изменяющая ручка каталога обязана требовать платформенное
   * право. Проверено мутацией: верните `integrations.write` — тест краснеет.
   */
  it('изменяющие ручки каталога требуют платформенного права', () => {
    const offenders = catalogHandlers()
      .filter((h) => h.method !== 'Get')
      .filter((h) => !h.permissions.includes(PLATFORM_WRITE))
      .map((h) => `${h.method} ${h.route} → ${h.permissions.join(', ') || 'без прав'}`);

    expect(
      offenders,
      `Изменяющая ручка платформенного каталога доступна не только платформе. ` +
        `Каталог провайдеров один на всех арендаторов: администратор одного учебного центра ` +
        `сможет выключить провайдера остальным. Нужное право — ${PLATFORM_WRITE}.`
    ).toEqual([]);
  });

  it('право арендатора на запись каталогом больше не принимается', () => {
    const withTenantWrite = catalogHandlers()
      .filter((h) => h.method !== 'Get')
      .filter((h) => h.permissions.includes('integrations.write'))
      .map((h) => `${h.method} ${h.route}`);
    expect(withTenantWrite).toEqual([]);
  });

  /*
   * Вторая половина инварианта: читать каталог арендатор ДОЛЖЕН — иначе он не выберет,
   * к чему подключаться, и экран интеграций опустеет. «Закрыть всё» здесь было бы
   * не усилением, а поломкой.
   */
  it('читать каталог арендатор по-прежнему может', () => {
    const reads = catalogHandlers().filter((h) => h.method === 'Get');
    expect(reads.length).toBeGreaterThan(0);
    for (const handler of reads) {
      expect(handler.permissions, `${handler.method} ${handler.route}`).toContain(TENANT_READ);
      expect(handler.permissions).not.toContain(PLATFORM_WRITE);
    }
  });

  /*
   * Право обязано быть заведено миграцией и выдано платформе — иначе ручка станет
   * недоступна вообще никому, и это обнаружится только в бою.
   */
  it('право заведено миграцией и выдано роли платформы', () => {
    const migrations = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations');
    const sql = readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(resolve(migrations, f), 'utf8'))
      .join('\n');
    expect(sql, 'право не заведено ни в одной миграции').toContain(PLATFORM_WRITE);
    // И выдано платформенной роли — иначе никто не сможет управлять каталогом.
    const grants = sql.slice(sql.indexOf(PLATFORM_WRITE));
    expect(grants).toContain('platform_admin');
  });
});
