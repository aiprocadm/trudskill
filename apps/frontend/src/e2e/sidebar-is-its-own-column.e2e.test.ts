import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * Колонка меню — отдельная и фиксированная (ТЗ «Стабилизация, UX и развитие», 3.3 / Н2).
 *
 * **Как было.** Колонка прокручивалась вместе с содержимым: раскрыв группы, человек получал
 * страницу в несколько экранов, где слева меню, справа пустота; прокручивая длинную таблицу, он
 * терял меню из виду совсем. После задачи 3.1 меню стало выше — группы видны сразу, — и это
 * стало заметнее.
 *
 * **Что закреплено.** Три требования ТЗ: колонка прилипает и имеет свою прокрутку; её можно
 * свернуть до значков; свёрнутость запоминается. Плюс инвариант, который легко сломать
 * невнимательной правкой: **файл стилей — шаблонная строка, и обратная кавычка внутри него
 * закрывает строку и ломает сборку.** Поймано на этой же задаче.
 */

const SHELL_STYLES = fromApp('..', '..', 'packages', 'ui', 'src', 'styles', 'shell.ts');
const APP_SHELL = fromApp('src', 'widgets', 'shell', 'app-shell.tsx');

const styles = (): string => readFileSync(SHELL_STYLES, 'utf8');
const shellCode = (): string => stripComments(readFileSync(APP_SHELL, 'utf8'));

describe('колонка меню живёт своей жизнью (ТЗ 3.3)', () => {
  it('колонка прилипает и прокручивается сама', () => {
    const css = styles();
    const block = css.slice(
      css.indexOf('.app-shell__sidebar {'),
      css.indexOf('.app-shell--narrow')
    );

    expect(block.length, 'правило колонки не найдено').toBeGreaterThan(0);
    expect(/position:\s*sticky/.test(block), 'без прилипания меню уезжает вместе с таблицей').toBe(
      true
    );
    expect(/overflow-y:\s*auto/.test(block), 'своя прокрутка: меню длиннее экрана').toBe(true);
    expect(
      /height:\s*100dvh/.test(block),
      'высота в dvh, а не vh: на телефоне адресная строка то появляется, то исчезает, и vh врёт'
    ).toBe(true);
  });

  it('колонку можно свернуть до значков, и значок есть у каждого пункта', () => {
    const css = styles();
    expect(/\.app-shell--narrow/.test(css), 'свёрнутого вида нет вовсе').toBe(true);
    /*
     * Окно намеренно широкое: правило прячет подписи ОДНИМ списком селекторов (подпись, заголовок
     * группы, вордмарк, роль, шеврон, содержимое группы, подсказка), и до `display: none` там
     * больше двухсот знаков. Первая версия проверки с окном в 200 покраснела на здоровом коде —
     * ровно та ошибка, которую сторож обязан не делать.
     */
    expect(
      /\.app-shell--narrow \.app-shell__link-label[\s\S]{0,500}display:\s*none/.test(css),
      'в свёрнутом виде подписи прячутся — иначе это не «остаются значки»'
    ).toBe(true);

    const code = shellCode();
    expect(
      /iconForHref\(item\.href\)/.test(code),
      'значок пункта берётся у его блока: своего значка у пункта нет, а пустая строка в свёрнутой ' +
        'колонке — это исчезнувший раздел'
    ).toBe(true);
  });

  it('свёрнутость запоминается между переходами', () => {
    const code = shellCode();
    expect(
      /readSidebarCollapsed\(window\.localStorage\)/.test(code) &&
        /writeSidebarCollapsed\(window\.localStorage/.test(code),
      'ТЗ требует сохранения состояния: человек настраивает ширину один раз'
    ).toBe(true);
  });

  it('кнопка называет результат нажатия, а не текущее состояние', () => {
    /* Правило продукта №5: кнопка называет результат. «Свернуть меню» — сворачивает. */
    const code = shellCode();
    expect(/Свернуть меню/.test(code)).toBe(true);
    expect(/Развернуть меню/.test(code)).toBe(true);
  });

  it('в строке стилей нет обратных кавычек — они закрывают её и ломают сборку', () => {
    /*
     * Поймано на этой задаче: комментарий внутри CSS содержал `100dvh` в обратных кавычках,
     * строка закрылась, и файл перестал быть валидным TypeScript. Проверка типов это ловит, но
     * сообщение («identifier cannot follow a numeric literal») уводит совсем не туда.
     */
    const css = styles();
    const start =
      css.indexOf('export const shellStyles = `') + 'export const shellStyles = `'.length;
    const end = css.lastIndexOf('`');
    expect(
      css.slice(start, end).includes('`'),
      'обратная кавычка внутри строки стилей закрывает её досрочно'
    ).toBe(false);
  });
});
