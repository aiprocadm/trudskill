import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Право, которое требует код, должно существовать в базе.
 *
 * `PermissionGuard` резолвит права строго через `iam.user_roles → iam.role_permissions →
 * iam.permissions`. Права, которого нет в `iam.permissions`, не может быть ни у кого —
 * включая администратора центра и платформенного администратора. Поэтому забытая строка
 * в миграции даёт не «чуть строже, чем надо», а **запертую наглухо** функциональность,
 * причём молча: экран просто не показывается в меню, а ручка отвечает отказом.
 *
 * Так и случилось. Ревизия 2026-08-26 нашла девять таких сирот: весь раздел электронной
 * подписи (`esign.*`) и `documents.generate` — то есть заявки на подпись, процессы
 * подписания, юридический журнал и выпуск документов, включая «закрыть группу». Таблицы
 * под всё это заведены ещё миграцией 0004, контроллеры права требуют, экраны их
 * спрашивают — а самих прав не было ни в одной миграции и ни в одной живой базе.
 *
 * Ни один сторож этого не ловил: реестр поверхности проверял, что право ОБЪЯВЛЕНО у ручки,
 * и не спрашивал, существует ли оно. Заведено миграцией 0085.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(HERE, '..', '..', '..');
const SRC = join(BACKEND, 'src');
const MIGRATIONS = join(BACKEND, 'migrations');

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (full.endsWith('.ts') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Права, которые код требует у ручек. */
const requiredByCode = (): Set<string> => {
  const codes = new Set<string>();
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const decorator of src.matchAll(/@RequirePermissions\(([^)]*)\)/g)) {
      for (const literal of decorator[1]!.matchAll(/'([^']+)'/g)) codes.add(literal[1]!);
    }
  }
  return codes;
};

/**
 * Права, которые заводят миграции.
 *
 * Читаем ЛЮБУЮ строку вида `a.b` из SQL, а не только вставки в `iam.permissions`: форма
 * вставки за 85 миграций менялась (`VALUES`, `SELECT ... FROM`, массивы в `IN (...)`), и
 * сторож, привязанный к одной форме, начал бы врать при следующей. Ложные срабатывания
 * тут дешевле пропусков: лишняя строка из SQL максимум подтвердит существующее право.
 */
const seededByMigrations = (): Set<string> => {
  const codes = new Set<string>();
  for (const entry of readdirSync(MIGRATIONS)) {
    if (!entry.endsWith('.sql')) continue;
    const src = readFileSync(join(MIGRATIONS, entry), 'utf8');
    for (const literal of src.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)) codes.add(literal[1]!);
  }
  return codes;
};

describe('право, которое требует код, заведено миграцией', () => {
  const required = requiredByCode();
  const seeded = seededByMigrations();

  it('права вообще найдены — иначе сторож зеленеет ни на чём', () => {
    expect(required.size).toBeGreaterThan(50);
    expect(seeded.size).toBeGreaterThan(50);
  });

  it('нет прав-сирот: всё, что требуют ручки, существует в базе', () => {
    const orphans = [...required].filter((code) => !seeded.has(code)).sort();
    expect(
      orphans,
      'право требуется кодом, но не заводится ни одной миграцией — оно не может быть ' +
        'выдано никому, и раздел будет заперт молча. Заведите его новой миграцией и ' +
        'раздайте ролям в том же файле.'
    ).toEqual([]);
  });
});
