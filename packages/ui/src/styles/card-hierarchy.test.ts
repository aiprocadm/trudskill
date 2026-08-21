import { describe, expect, it } from 'vitest';

import { uiGlobalStyles } from './index.js';
import { darkThemeVars, lightThemeVars } from '../tokens/index.js';

/**
 * `UI-014`: иерархия строится размером, весом и расстоянием. Рамка допускается только там,
 * где разделяет два независимых потока данных: строки таблицы, границы полей ввода, край
 * сайдбара. **Карточка секции получает фон, а не рамку.**
 *
 * Почему это не вкусовщина. Рамка вокруг каждого блока превращает экран в сетку клеток
 * одинакового веса: глазу не за что зацепиться, всё выглядит одинаково важным. Фон и
 * расстояние дают ту же группировку, не добавляя линий.
 *
 * Оговорка, ради которой пришлось трогать палитру: карточка отделяется фоном только если
 * фон страницы и фон карточки различимы. Прежняя пара `#f8fafc` / `#ffffff` отличалась на
 * доли процента яркости — без рамки карточка растворялась. Поэтому фон страницы сделан
 * заметнее, и сторож проверяет саму эту разницу, а не только отсутствие рамки.
 */

/** Классы, которые ТЗ называет карточками: у них рамки быть не должно. */
const CARD_SELECTORS = [
  '.ui-section-card',
  '.ui-card',
  '.stat-card',
  '.entry-card',
  '.course-card',
  '.course-progress'
];

/**
 * Правило может быть записано списком: `.ui-section-card,.ui-card { … }`. Поэтому селектор
 * ищется как отдельный элемент списка до открывающей скобки, а не как начало строки —
 * первая редакция сторожа искала начало и не нашла `.ui-card`.
 */
const ruleFor = (selector: string): string | undefined =>
  uiGlobalStyles.split('\n').find((line) =>
    line
      .split('{')[0]
      ?.split(',')
      .map((part) => part.trim())
      .includes(selector)
  );

/** Относительная яркость по WCAG — та же формула, что в аудите контрастов. */
const luminance = (hex: string): number => {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
};

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};

describe('UI-014 · карточку держит фон, а не рамка', () => {
  it.each(CARD_SELECTORS)('%s объявлена без рамки', (selector) => {
    const rule = ruleFor(selector);

    expect(rule, `правило для ${selector} не найдено — сторож смотрит не туда`).toBeDefined();
    expect(rule, `${selector} всё ещё обведена рамкой`).not.toContain(
      'border: 1px solid var(--ui-border)'
    );
  });

  it('карточка секции опирается на фон', () => {
    expect(ruleFor('.ui-section-card')).toContain('background: var(--ui-surface)');
  });

  it('фон страницы и фон карточки различимы глазом — иначе карточка растворяется', () => {
    for (const theme of [
      { name: 'светлая', vars: lightThemeVars },
      { name: 'тёмная', vars: darkThemeVars }
    ]) {
      const ratio = contrast(theme.vars['--ui-bg'], theme.vars['--ui-surface']);
      // 1.08 — порог, ниже которого разница читается как «один и тот же цвет».
      expect(ratio, `${theme.name} тема: фон страницы и карточки почти совпадают`).toBeGreaterThan(
        1.08
      );
    }
  });
});
