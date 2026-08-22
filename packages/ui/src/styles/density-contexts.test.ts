import { describe, expect, it } from 'vitest';

import { uiGlobalStyles } from './index.js';

/**
 * `UI-016`: плотность отступов задаётся контекстом, а не на глаз.
 *
 * Таблица ТЗ: реестр — плотно (ячейка md, между блоками lg, строка таблицы 44px);
 * карточка объекта — внутренний lg, между блоками xl; дашборд и форма — просторно.
 *
 * До этого среза значения стояли вразнобой и мимо шкалы: карточка 20/14, каркас страницы 18,
 * ячейка таблицы 11 — ни одно из четырёх не является ступенью шкалы 4/8/12/16/24/32.
 * Разнобой не виден по одному месту: он копится и делает соседние экраны разными без причины.
 *
 * Контекст «просторно» (24/32) сторож пока не проверяет: ему нужен шаблонный класс
 * дашборда (`TPL-005`), которого ещё нет, — это записанный остаток `UI-016`, а не пропуск.
 */

/**
 * ВСЕ однострочные правила селектора, а не первое: у `.ui-section-card` их два —
 * `.ui-section-card,.ui-card { фон }` и `.ui-section-card { отступы }`. Первая редакция
 * сторожа брала первое попавшееся и проверяла отступ в правиле про фон.
 */
const rulesFor = (selector: string): string[] =>
  uiGlobalStyles.split('\n').filter((line) =>
    line
      .split('{')[0]
      ?.split(',')
      .map((part) => part.trim())
      .includes(selector)
  );

const someRuleContains = (selector: string, fragment: string): boolean =>
  rulesFor(selector).some((rule) => rule.includes(fragment));

describe('UI-016 · контекст «реестр»: плотно', () => {
  it.each(['.ui-table th', '.ui-table td'])('%s — строка 44px, отступы sm/md', (selector) => {
    expect(rulesFor(selector).length, `правило ${selector} не найдено`).toBeGreaterThan(0);
    // height у ячейки таблицы работает как минимум: однострочная строка получает ровно 44,
    // многострочная растёт. Это же значение — минимальная тач-зона (решение владельца №C).
    expect(someRuleContains(selector, 'height: 44px')).toBe(true);
    expect(someRuleContains(selector, 'padding: var(--ui-space-sm) var(--ui-space-md)')).toBe(true);
  });
});

describe('UI-016 · контекст «карточка объекта»', () => {
  it('внутренний отступ карточки — lg', () => {
    expect(someRuleContains('.ui-section-card', 'padding: var(--ui-space-lg)')).toBe(true);
  });

  it('между колонками разворота карточки — xl', () => {
    // Правило .ui-detail многострочное — ищем строку gap внутри блока.
    const start = uiGlobalStyles.indexOf('.ui-detail {');
    const block = uiGlobalStyles.slice(start, uiGlobalStyles.indexOf('}', start));

    expect(start, 'правило .ui-detail не найдено').toBeGreaterThan(-1);
    expect(block).toContain('gap: var(--ui-space-xl)');
  });
});

describe('UI-016 · отступы каркаса — ступени шкалы', () => {
  it('каркас страницы держит блоки на lg', () => {
    expect(someRuleContains('.ui-page', 'gap: var(--ui-space-lg)')).toBe(true);
  });

  it('вертикальный стек — md', () => {
    expect(someRuleContains('.ui-stack', 'gap: var(--ui-space-md)')).toBe(true);
  });
});
