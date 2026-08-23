import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `CMP-021` · постраничная навигация — только компонентом `Pagination` из `@trudskill/ui`.
 *
 * История требования. ТЗ называет один самодельный листатель — `SimplePagination` из
 * `components/list-controls.tsx`: пара голых `<button>` и подпись «Стр. N». Разведка среза
 * нашла **второй**, в общем слое монолита (`PaginationControls`), и оба к этому моменту
 * расходились с компонентом пакета в мелочах: где «Далее», где «Вперёд», где номер страницы
 * без общего числа. Человек листает три реестра тремя разными способами.
 *
 * Что именно держит сторож: если файл показывает человеку **номер страницы**, он обязан
 * рисовать навигацию компонентом пакета. Кнопки «Назад»/«Далее» сами по себе не запрещены —
 * это шаги мастера курса, вопросы теста и месяцы календаря, к листанию отношения не имеющие.
 * Признак именно листателя — подпись со словом «Стр.»/«Страница» рядом с переменной.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

const SCAN_ROOTS = [join(FRONTEND, 'src'), join(FRONTEND, 'app')];

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (!full.endsWith('.tsx')) continue;
    if (full.includes('.test.')) continue;
    acc.push(full);
  }
  return acc;
};

/**
 * Комментарии снимаются перед проверкой. Иначе сторож запрещает **описывать** находку:
 * первая редакция покраснела на комментарии в самом экране уведомлений, где сказано, от
 * какого компонента экран избавили. Ровно та же ловушка была у сторожа значков.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Подпись листателя: «Стр. {page}», «Страница {page}» — то есть номер страницы человеку. */
const PAGE_LABEL = /Стр(?:аница|\.)\s*\{/;

describe('CMP-021 · листание — только компонентом дизайн-системы', () => {
  const files = SCAN_ROOTS.flatMap((root) => collect(root));

  it('сторож видит экраны приложения', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('ни один экран не рисует номер страницы своей разметкой', () => {
    const offenders = files
      .filter((file) => PAGE_LABEL.test(withoutComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(FRONTEND, file));

    expect(
      offenders,
      `самодельный листатель вместо Pagination из @trudskill/ui:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('удалённые обходные компоненты не вернулись', () => {
    const blob = files.map((file) => withoutComments(readFileSync(file, 'utf8'))).join('\n');
    for (const gone of ['SimplePagination', 'SearchStatusFilter', 'PaginationControls']) {
      expect(blob.includes(gone), `${gone} удалён по CMP-021, но снова встречается`).toBe(false);
    }
  });
});
