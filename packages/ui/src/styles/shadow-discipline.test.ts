import { describe, expect, it } from 'vitest';

import { uiGlobalStyles } from './index.js';

/**
 * `UI-019`: тень — признак того, что слой ВСПЛЫЛ над страницей.
 *
 * ТЗ: `--ui-shadow` только у всплывающих слоёв (модалка, палитра, выдвижная панель,
 * выпадашка, липкая полоса действий); `--ui-shadow-strong` — только у выдвижной панели и
 * модалки. Статичная карточка теней не имеет: её отделяют фон, рамка и расстояние.
 *
 * Зачем правило. Когда тень есть у всего, она перестаёт что-либо значить: глаз не отличает
 * «это лежит поверх страницы и ждёт ответа» от «это просто блок с данными». До этого среза
 * тень стояла у **всех карточек секций** (`.ui-section-card, .ui-card`), у плиток, у карточек
 * курса и показателя — то есть почти везде.
 */

/** Слои, которым тень положена по ТЗ. */
const POPUP_LAYERS = [
  'ui-drawer',
  'ui-modal',
  'cmdk',
  'app-shell__sidebar',
  'app-shell__menu-toggle',
  'ui-bulk-bar',
  'ui-column-picker',
  // CMP-015: меню «Ещё» в шапке — выпадающий слой поверх страницы.
  'ui-header-menu',
  // CMP-001 / ТЗ 5.1: меню «…» строки таблицы — тот же выпадающий слой.
  'ui-overflow-menu'
];

/** Сильная тень — только у этих двух. */
const STRONG_ONLY = ['ui-drawer', 'ui-modal', 'app-shell__sidebar'];

/**
 * Селектор, к которому относится объявление: последняя строка вида `.что-то {` перед ним.
 * Разбор грубый, но честный — стили лежат обычным текстом, и парсер CSS ради сторожа не нужен.
 */
const selectorsWithShadow = (css: string, token: string): string[] => {
  const lines = css.split('\n');
  const found: string[] = [];
  let selector = '(начало файла)';
  for (const line of lines) {
    const trimmed = line.trim();
    const asSelector = /^([.#][^{]*)\{/.exec(trimmed);
    if (asSelector) selector = asSelector[1]!.trim();
    if (!trimmed.includes('box-shadow')) continue;
    if (!trimmed.includes(token)) continue;
    // Однострочные правила: «.foo { … box-shadow: … }» — селектор в той же строке.
    found.push(asSelector ? asSelector[1]!.trim() : selector);
  }
  return found;
};

const allowed = (selector: string, list: string[]): boolean =>
  list.some((layer) => selector.includes(layer));

describe('UI-019 · тень только у всплывающих слоёв', () => {
  const css = uiGlobalStyles;

  it('сторож видит стили (не пустая строка)', () => {
    expect(css.length).toBeGreaterThan(1000);
    expect(css).toContain('box-shadow');
  });

  it('обычная тень — только у всплывающих слоёв', () => {
    const offenders = selectorsWithShadow(css, 'var(--ui-shadow)').filter(
      (selector) => !allowed(selector, POPUP_LAYERS)
    );

    expect(offenders, `тень у статичных элементов:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('сильная тень — только у модалки и выдвижной панели', () => {
    const offenders = selectorsWithShadow(css, 'var(--ui-shadow-strong)').filter(
      (selector) => !allowed(selector, STRONG_ONLY)
    );

    expect(offenders, `сильная тень не там:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('карточка секции живёт без тени — её отделяют фон и рамка', () => {
    const cardRule = css.split('\n').find((line) => line.startsWith('.ui-section-card'));

    expect(cardRule).toBeDefined();
    expect(cardRule).not.toContain('box-shadow');
    expect(cardRule).toContain('background');
  });
});
