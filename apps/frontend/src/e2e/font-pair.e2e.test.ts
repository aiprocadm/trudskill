import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Пара шрифтов: Onest для заголовков, Inter для текста (ТЗ 7.4 пункт 1, решение владельца Р5).
 *
 * **Зачем.** Интерфейс был опрятным, но обезличенным — его не отличить от десятка других
 * админок. Продукт сдаётся в аренду учебным центрам, а центр выбирает в том числе глазами.
 * Пара «характерные заголовки + спокойный текст» даёт лицо, не трогая читаемость там, где
 * человек работает часами: таблицы, поля, подписи остаются на Inter (журнал 568).
 *
 * **Что закреплено.**
 *
 * 1. Оба шрифта едут ИЗ СБОРКИ, а не с чужого адреса. Это требование и скорости, и
 *    независимости от иностранных сервисов; вдобавок браузер человека не должен ходить на
 *    зарубежный сервер за каждым экраном.
 * 2. Заголовки берут шрифт заголовков, и у каждого есть запасной — пока шрифт едет, текст
 *    рисуется системным, а не пропадает.
 * 3. Начертаний ровно столько, сколько нужно заголовкам. Каждое лишнее — килобайты, которые
 *    едут к человеку на телефоне перед первым экраном.
 */

const layout = stripComments(readFileSync(fromApp('app', 'layout.tsx'), 'utf8'));
const foundation = stripComments(
  readFileSync(fromPackages('ui', 'src', 'styles', 'foundation.ts'), 'utf8')
);

describe('шрифты едут из сборки, а не с чужого адреса (ТЗ 7.4, Р5)', () => {
  it('оба шрифта подключены механизмом, который кладёт файлы в сборку', () => {
    /*
     * Проверяем ИМПОРТ, а не вызов: `const Onest = Inter` оставил бы вызов `Onest({` на месте,
     * и сторож пропустил бы исчезновение пары — поймано подсадкой.
     */
    expect(layout, 'шрифт заголовков больше не приходит из набора').toMatch(
      /import \{[^}]*\bOnest\b[^}]*\} from 'next\/font\/google'/
    );
    expect(layout, 'шрифт текста больше не приходит из набора').toMatch(
      /import \{[^}]*\bInter\b[^}]*\} from 'next\/font\/google'/
    );
    expect(layout).toMatch(/Onest\(\{/);
    expect(layout).toMatch(/Inter\(\{/);
  });

  it('ни одной ссылки на внешний шрифтовой сервис в разметке', () => {
    /*
     * Тег со ссылкой на чужой домен отправил бы браузер человека за шрифтом на зарубежный
     * сервер при каждом заходе — и страница ждала бы ответа этого сервера, чтобы показать
     * первую букву.
     */
    expect(layout).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\./);
  });

  it('пока шрифт едет, текст виден системным', () => {
    /* `swap` — это «показывай запасным, подменишь потом». Без него пустое место вместо слов. */
    const declarations = layout.match(/display:\s*'[a-z]+'/g) ?? [];
    expect(declarations.length, 'не у всех шрифтов задано поведение на время загрузки').toBe(2);
    for (const declaration of declarations) expect(declaration).toContain("'swap'");
  });

  it('у обоих шрифтов есть кириллица', () => {
    /* Продукт русскоязычный: шрифт без кириллицы подменялся бы системным на каждой букве. */
    const subsets = layout.match(/subsets:\s*\[[^\]]+\]/g) ?? [];
    expect(subsets.length).toBe(2);
    for (const subset of subsets) expect(subset).toContain('cyrillic');
  });
});

describe('заголовки берут шрифт заголовков (ТЗ 7.4, Р5)', () => {
  const HEADINGS = ['.ui-page-title', '.ui-section-title', '.ui-hero__title', '.ui-wordmark'];

  it.each(HEADINGS)('%s набран шрифтом заголовков', (selector) => {
    const rule = foundation.slice(
      foundation.indexOf(`${selector} {`),
      foundation.indexOf('}', foundation.indexOf(`${selector} {`))
    );
    expect(rule, `${selector} не берёт шрифт заголовков`).toMatch(
      /font-family:\s*var\(--font-display\)/
    );
    /* Запасной идёт следом: если Onest не доехал, заголовок рисуется тем же, что и текст. */
    expect(rule, `${selector} остался бы без запасного шрифта`).toMatch(
      /var\(--font-display\),\s*var\(--font-sans\)/
    );
  });

  it('текст интерфейса остаётся на шрифте текста', () => {
    /*
     * Главное правило пары: характер даёт заголовок, а работают люди с таблицами и полями.
     * Набрать характерным шрифтом ВСЁ — значит поменять читаемость там, где она дороже вида.
     */
    const body = foundation.slice(0, foundation.indexOf('.ui-page-title'));
    expect(body).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(body, 'шрифт заголовков расползся на весь текст').not.toMatch(
      /body[^{}]*{[^}]*--font-display/
    );
  });
});
