import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Платформенные права выдаются **только** роли платформы.
 *
 * Разбор журнала расхождений (запись 11) поднял вопрос: сид выдаёт `tenant_admin` все
 * права одним `join iam.permissions on true`, без фильтра по коду права. Проверка показала,
 * что утечки нет — платформенные права (`platform.*`) появились позже и раздаются
 * точечно, по `where r.code = 'platform_admin'`.
 *
 * Но это держится на внимательности того, кто пишет следующую миграцию: достаточно одного
 * «выдать всем» рядом с новым `platform.*` правом, и администратор учебного центра получит
 * управление чужими центрами. Поэтому правило записано тестом.
 *
 * Разбор грубый — по тексту SQL, без базы: тест обязан работать в обычном прогоне, где
 * PostgreSQL нет. Он ловит не «какие права в живой базе» (это меряется на стенде), а
 * «что миграция раздаёт по коду».
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', '..', '..', 'migrations');

/** Права, которыми управляют платформой, а не своим учебным центром. */
const PLATFORM_PREFIX = 'platform.';

interface Grant {
  file: string;
  /** Текст одного `insert into iam.role_permissions … ;` */
  statement: string;
}

const grantsWithPlatformRights = (): Grant[] => {
  const out: Grant[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const statements = sql.split(/;\s*(?:\r?\n|$)/);
    for (const statement of statements) {
      const lowered = statement.toLowerCase();
      if (!lowered.includes('insert into iam.role_permissions')) continue;
      if (!statement.includes(PLATFORM_PREFIX)) continue;
      out.push({ file, statement });
    }
  }
  return out;
};

describe('платформенные права не достаются арендатору', () => {
  it('в миграциях вообще есть выдачи платформенных прав — иначе проверять нечего', () => {
    expect(grantsWithPlatformRights().length).toBeGreaterThan(0);
  });

  it('каждая такая выдача ограничена ролью platform_admin', () => {
    const unsafe = grantsWithPlatformRights()
      .filter(({ statement }) => {
        const lowered = statement.toLowerCase();
        // Выдача обязана называть роль платформы и не должна раздавать права «всем подряд».
        const namesPlatformAdmin = lowered.includes("'platform_admin'");
        const grantsToEveryRole = /join\s+iam\.permissions\s+\w*\s*on\s+true/.test(lowered);
        return !namesPlatformAdmin || grantsToEveryRole;
      })
      .map(({ file }) => file);

    expect(
      unsafe,
      `эти миграции раздают платформенные права шире роли платформы:\n${unsafe.join('\n')}\n` +
        'Платформенное право означает управление ЧУЖИМИ учебными центрами — оно не может ' +
        'достаться администратору одного из них.'
    ).toEqual([]);
  });
});
