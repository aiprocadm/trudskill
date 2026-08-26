import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * «Не нашлось в справочнике» — это не «удалено» и не «система».
 *
 * Экраны подставляют названия и имена через справочник, загруженный страницей:
 * `const userName = new Map(...); userName.get(id) ?? '…'`. Справочник конечен, и в
 * достаточно крупном центре он обрывается — а подстановка на этом месте писала УТВЕРЖДЕНИЕ.
 *
 * Журнал действий писал «система» (ревизия 2026-08-26, журнал 234): действие живого
 * сотрудника, не попавшего в первую сотню справочника, приписывалось системе — вранье
 * ровно в том журнале, по которому разбирают спор. Юридический журнал подписания писал
 * «Учётная запись удалена» про действующего сотрудника.
 *
 * Разница принципиальная: «Без названия» описывает то, что видно (названия нет), а
 * «удалён» утверждает факт, которого экран не знает. Сторож ловит вторую форму.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/** Формулировки, утверждающие факт, которого подстановка знать не может. */
const CLAIMS = /(удал[её]н|система|систем[ыу]|не существует|отсутствует в системе|уволен)/i;

/** `что-то.get(...) ?? 'формулировка'` — подстановка из справочника с запасным значением. */
const LOOKUP_FALLBACK = /\.get\([^)]*\)\s*\?\?\s*'([^']+)'/g;

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if ((full.endsWith('.tsx') || full.endsWith('.ts')) && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

describe('подстановка из справочника не утверждает того, чего не знает', () => {
  const offenders: string[] = [];
  for (const file of ROOTS.flatMap((root) => collect(root))) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(LOOKUP_FALLBACK)) {
      if (!CLAIMS.test(match[1]!)) continue;
      offenders.push(`${relative(APP_ROOT, file).replace(/\\/g, '/')}: «${match[1]}»`);
    }
  }

  it('запасное значение описывает незнание, а не выдумывает факт', () => {
    expect(
      offenders.sort(),
      'справочник конечен: «не нашлось» нельзя показывать как «удалено» или «система» — ' +
        'напишите то, что действительно известно («Имя не загружено», «Без названия»)'
    ).toEqual([]);
  });
});
