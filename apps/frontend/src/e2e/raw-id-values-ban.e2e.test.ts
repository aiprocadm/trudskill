import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Идентификатор не выводится человеку как значение (правило продукта).
 *
 * Сторож `id-input-ban` ловит противоположную сторону — когда идентификатор **просят ввести**.
 * Обратную половину до Фазы 5 не проверял никто, и находки накопились: в шапке кабинета на
 * каждом экране висел идентификатор арендатора с подписью «Тенант»; в карточке сотрудника
 * поле «Организация» показывало тот же идентификатор; **список зачисленных в группу состоял
 * из идентификаторов вместо фамилий**; список видеозаписей опознавался по коду записи.
 *
 * Ловится узкий и однозначный случай: `{что-то.id}` или `{что-то.somethingId}` как ЕДИНСТВЕННОЕ
 * содержимое узла разметки. Ключи (`key={item.id}`), обработчики (`onSelect(row.id)`) и адреса
 * (`href={`/groups/${id}`}`) сюда не попадают — там идентификатор на своём месте.
 */

const ROOTS = [fromApp('src'), fromApp('app')];
/** `>{x.id}<` — узел, в котором нет ничего, кроме идентификатора. */
const RAW_ID_NODE = />\s*\{[A-Za-z_$][\w$?.]*\.(?:id|[a-z]\w*Id)\}\s*</;

/** Известные места на момент Фазы 5 среза 2. Пусто — беда вычищена целиком. */
const KNOWN: Record<string, string> = {};

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

const files = ROOTS.flatMap((root) => collect(root));

describe('идентификатор не показывается человеку как значение', () => {
  const offenders = files
    .filter((file) => RAW_ID_NODE.test(readFileSync(file, 'utf8')))
    .map((file) => relative(APP_ROOT, file).replace(/\\/g, '/'))
    .sort();

  it('новых мест, где выводится голый идентификатор, не появилось', () => {
    const unexpected = offenders.filter((file) => !(file in KNOWN));
    expect(
      unexpected,
      'идентификатор выведен значением — покажите название, фамилию или другой понятный признак'
    ).toEqual([]);
  });

  it('очередь не содержит уже исправленных мест — иначе список врёт', () => {
    const fixed = Object.keys(KNOWN).filter((file) => !offenders.includes(file));
    expect(fixed, 'место исправлено — уберите его из списка сторожа').toEqual([]);
  });

  /*
   * Проверка самого сканера: он должен отличать вывод человеку от служебного применения
   * идентификатора. Без неё правило легко «починить», сузив выражение до пустоты.
   */
  it('сканер ловит вывод значением и не трогает ключи, адреса и обработчики', () => {
    expect(RAW_ID_NODE.test('<span>{item.learnerId}</span>')).toBe(true);
    expect(RAW_ID_NODE.test('<dd>{user.tenantId}</dd>')).toBe(true);
    expect(RAW_ID_NODE.test('<li key={item.id} className="x">')).toBe(false);
    expect(RAW_ID_NODE.test('onSelect={() => open(row.id)}')).toBe(false);
    expect(RAW_ID_NODE.test('<Link href={`/groups/${group.id}`}>{group.name}</Link>')).toBe(false);
  });
});
