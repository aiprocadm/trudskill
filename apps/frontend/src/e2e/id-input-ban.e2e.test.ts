import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Поля «вставьте идентификатор» (правило продукта: ни одного сырого ID как значения).
 *
 * За срезы 5–9 Фазы 4 такое поле находилось на КАЖДОМ разобранном экране: `entity_id` при
 * выпуске документа, «ID курса» при создании теста, `course_id` / `group_id` / `client_id`
 * в аналитике и отчётах. Администратор учебного центра идентификаторов не знает — их
 * приходилось подсматривать в адресной строке другого экрана.
 *
 * Сторож не запрещает такие поля задним числом: он фиксирует ОЧЕРЕДЬ известных мест
 * с указанием волны и падает, если появится НОВОЕ. Тот же приём, что у сторожа единых
 * состояний: список — это очередь, а не разрешение.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];
/*
 * Ловим и подписи со словом «ID», и образцы родного формата идентификаторов
 * («mat_…», «group_…»): поле видео-загрузки с placeholder="mat_..." проходило
 * мимо прежней записи — в образце не было слова «ID» (слепая зона, срез 6).
 */
const ID_PLACEHOLDER =
  /placeholder=["'][^"']*(?:\bID\b|\bid\b|_id|UUID|\b[a-z]{2,12}_(?:\.\.\.|…))[^"']*["']/;

/*
 * Очередь пуста с фазы 6 среза 6: все 19 полей «вставьте идентификатор», найденные
 * сплошным поиском в срезе 9, переведены на выбор по названию. Сторож остаётся —
 * он ловит НОВОЕ такое поле в любом экране.
 */
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

describe('поля «вставьте идентификатор» (очередь редизайна)', () => {
  const offenders = ROOTS.flatMap((root) => collect(root))
    .filter((file) => ID_PLACEHOLDER.test(readFileSync(file, 'utf8')))
    .map((file) => relative(APP_ROOT, file).replace(/\\/g, '/'))
    .sort();

  it('новых мест, где просят вставить идентификатор, не появилось', () => {
    const unexpected = offenders.filter((file) => !(file in KNOWN));
    expect(
      unexpected,
      'экраны просят у человека идентификатор — заменить выбором по названию'
    ).toEqual([]);
  });

  it('очередь не содержит уже исправленных мест — иначе список врёт', () => {
    const fixed = Object.keys(KNOWN).filter((file) => !offenders.includes(file));
    expect(fixed, 'место исправлено — уберите его из списка сторожа').toEqual([]);
  });

  it('у каждого места в очереди указана волна', () => {
    const withoutWave = Object.entries(KNOWN)
      .filter(([, note]) => !note.includes('волна'))
      .map(([file]) => file);
    expect(withoutWave).toEqual([]);
  });
});
