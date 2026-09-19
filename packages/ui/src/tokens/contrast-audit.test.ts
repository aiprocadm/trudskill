import { describe, expect, it } from 'vitest';

import { AA_LARGE_TEXT, AA_NORMAL_TEXT, contrastRatio } from './contrast.js';
import { darkThemeVars, lightThemeVars } from './index.js';

/**
 * `UI-001`: контрасты **измеряются**, а не переносятся из комментариев.
 *
 * До Фазы 5 обоснована была только светлая тема — числа стояли в комментариях `tokens/index.ts`
 * и никем не перепроверялись. Тёмная тема не проверялась ни разу: её значения подобрали «на
 * глаз как посветлее». Этот прогон меряет обе темы по одним и тем же парам «что на чём»
 * и падает, если пара не проходит порог AA.
 *
 * Почему список пар записан руками: цвет сам по себе не бывает «контрастным» — контраст есть
 * только у пары. Вывести пары из токенов нельзя, их задаёт вёрстка; поэтому пара — это
 * утверждение «мы рисуем ЭТО на ЭТОМ», и оно должно быть явным.
 */

type Pair = {
  /** Что рисуем. */
  fg: keyof typeof lightThemeVars;
  /** На чём рисуем. */
  bg: keyof typeof lightThemeVars;
  /** Где это видно — чтобы упавший тест сразу показывал экран, а не только имена токенов. */
  where: string;
  /** Порог: обычный текст 4.5:1, крупный текст и границы 3:1. */
  min: number;
};

const PAIRS: Pair[] = [
  // ── Текст на поверхностях ────────────────────────────────────────────────
  { fg: '--ui-text', bg: '--ui-bg', where: 'основной текст на фоне страницы', min: AA_NORMAL_TEXT },
  { fg: '--ui-text', bg: '--ui-surface', where: 'текст в карточке', min: AA_NORMAL_TEXT },
  {
    fg: '--ui-text',
    bg: '--ui-surface-muted',
    where: 'текст в приглушённом блоке (пустое состояние, шапка таблицы)',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-text-muted',
    bg: '--ui-surface',
    where: 'пояснение под полем и подпись в карточке',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-text-muted',
    bg: '--ui-bg',
    where: 'пояснение прямо на фоне страницы',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-text-muted',
    bg: '--ui-surface-muted',
    where: 'подпись внутри пустого состояния',
    min: AA_NORMAL_TEXT
  },

  // ── Смысловые цвета как ТЕКСТ ────────────────────────────────────────────
  { fg: '--ui-brand-600', bg: '--ui-surface', where: 'ссылка в карточке', min: AA_NORMAL_TEXT },
  { fg: '--ui-brand-600', bg: '--ui-bg', where: 'ссылка на фоне страницы', min: AA_NORMAL_TEXT },
  {
    fg: '--ui-danger-600',
    bg: '--ui-surface',
    where: 'текст ошибки и опасного действия',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-success-600',
    bg: '--ui-surface',
    where: 'сообщение об успехе',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-warning-600',
    bg: '--ui-surface',
    where: 'предупреждение',
    min: AA_NORMAL_TEXT
  },
  { fg: '--ui-info-600', bg: '--ui-surface', where: 'справочная подсказка', min: AA_NORMAL_TEXT },

  /*
   * ── Плашки статусов (ТЗ 7.2) ─────────────────────────────────────────────
   *
   * Этих пар здесь не было, и в этом была дыра: плашка рисовалась белым по цвету статуса
   * прямо в разметке, мимо токенов, поэтому мерить было нечего. В тёмной теме выходило от
   * 1.97:1 до 3.67:1 — то есть НИ ОДНА плашка не проходила AA, а сторож этого не видел
   * (журнал 561). Шрифт плашки мелкий, поэтому порог обычный, 4.5:1.
   */
  {
    fg: '--ui-tone-neutral-text',
    bg: '--ui-tone-neutral-bg',
    where: 'плашка «в работе»',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-tone-success-text',
    bg: '--ui-tone-success-bg',
    where: 'плашка «действующий», «завершён», «опубликован»',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-tone-warning-text',
    bg: '--ui-tone-warning-bg',
    where: 'плашка «ожидает», «в очереди»',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-tone-danger-text',
    bg: '--ui-tone-danger-bg',
    where: 'плашка «заблокирован», «отменён», «ошибка»',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-tone-off-text',
    bg: '--ui-tone-off-bg',
    where: 'плашка «в архиве», «черновик», «неактивен»',
    min: AA_NORMAL_TEXT
  },

  // ── Текст на цветных подложках ───────────────────────────────────────────
  {
    fg: '--ui-on-accent',
    bg: '--ui-accent-600',
    where: 'подпись первичной кнопки',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-on-accent',
    bg: '--ui-accent-700',
    where: 'подпись первичной кнопки под курсором',
    min: AA_NORMAL_TEXT
  },
  /*
   * ТЗ 7.4: кнопка в блоке «Следующий шаг» — ЕДИНСТВЕННОЕ место коралла, и красится она теперь
   * прямо акцентом. Отдельные токены `--ui-hero-cta-*` повторяли те же значения и были лишним
   * местом, где цвет мог разойтись сам с собой (журнал 566).
   */
  {
    fg: '--ui-on-accent',
    bg: '--ui-accent-600',
    where: 'кнопка в блоке «Следующий шаг» (единственное место коралла)',
    min: AA_NORMAL_TEXT
  },
  /*
   * Текст на фирменном цвете: первичная кнопка, шаг мастера, кружок с инициалами, счётчик.
   * Раньше здесь стоял белый ХАРДКОДОМ, и в тёмной теме это давало 3.67:1 (журнал 565).
   */
  {
    fg: '--ui-on-brand',
    bg: '--ui-brand-600',
    where: 'подпись первичной кнопки и активного шага мастера',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-on-brand',
    bg: '--ui-brand-700',
    where: 'первичная кнопка под курсором, кружок с инициалами',
    min: AA_NORMAL_TEXT
  },
  /*
   * Текст на смысловых цветах: «готово» на шаге мастера, подпись опасной кнопки. Белый на
   * светло-зелёном тёмной темы давал 1.97:1, на светло-красном — 2.76:1.
   */
  {
    fg: '--ui-on-color',
    bg: '--ui-success-600',
    where: 'подпись пройденного шага мастера',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-on-color',
    bg: '--ui-danger-600',
    where: 'подпись опасной кнопки',
    min: AA_NORMAL_TEXT
  },
  /*
   * UI-010: героя расплющили — фон стал измеримым (раньше это был градиент, и пары
   * «текст на герое» померить было нельзя). Заголовок героя рисуется брендом.
   */
  {
    fg: '--ui-hero-text',
    bg: '--ui-hero-bg',
    where: 'текст в блоке «Следующий шаг»',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-hero-muted',
    bg: '--ui-hero-bg',
    where: 'пояснение в блоке «Следующий шаг»',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-brand-700',
    bg: '--ui-hero-bg',
    where: 'заголовок блока «Следующий шаг» (бренд-акцент)',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-text',
    bg: '--ui-surface-accent',
    where: 'текст на фирменной подложке',
    min: AA_NORMAL_TEXT
  },

  // ── Боковое меню ─────────────────────────────────────────────────────────
  {
    fg: '--ui-nav-text',
    bg: '--ui-nav-sidebar-bg',
    where: 'пункт бокового меню',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-nav-text-muted',
    bg: '--ui-nav-sidebar-bg',
    where: 'название группы в боковом меню',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-nav-active-text',
    bg: '--ui-nav-sidebar-bg',
    where: 'текущий пункт меню',
    min: AA_NORMAL_TEXT
  },
  {
    fg: '--ui-nav-text',
    bg: '--ui-nav-hover-bg',
    where: 'пункт меню под курсором',
    min: AA_NORMAL_TEXT
  },

  /*
   * ── Не текст: границы и рамка фокуса (порог 3:1) ─────────────────────────
   *
   * Проверяется `--ui-border-strong`, а НЕ `--ui-border`. Это не поблажка, а разделение
   * ролей: WCAG 1.4.11 требует 3:1 от границы, которая единственная показывает, что перед
   * тобой элемент управления. У поля ввода это так — граница и есть поле. У разделителя
   * карточек и строк таблицы — нет: там смысл несут отступы и сама сетка, а тёмная линия
   * между каждой парой строк превратила бы таблицу в решётку.
   *
   * До этого разделения на поля ввода шёл `--ui-border`: 1.23:1 на белом. Человек со слабым
   * зрением просто не видел, где вводить.
   */
  {
    fg: '--ui-border-strong',
    bg: '--ui-surface',
    where: 'граница поля ввода в карточке',
    min: AA_LARGE_TEXT
  },
  {
    fg: '--ui-border-strong',
    bg: '--ui-bg',
    where: 'граница поля ввода на фоне страницы',
    min: AA_LARGE_TEXT
  },
  { fg: '--ui-focus', bg: '--ui-bg', where: 'рамка фокуса на фоне страницы', min: AA_LARGE_TEXT },
  { fg: '--ui-focus', bg: '--ui-surface', where: 'рамка фокуса в карточке', min: AA_LARGE_TEXT }
];

const THEMES = [
  { name: 'светлая', vars: lightThemeVars as Record<string, string> },
  { name: 'тёмная', vars: darkThemeVars as Record<string, string> }
];

describe('контрасты токенов измеряются, а не декларируются (UI-001)', () => {
  it('в списке пар нет опечаток в именах токенов', () => {
    const unknown: string[] = [];
    for (const pair of PAIRS) {
      for (const key of [pair.fg, pair.bg]) {
        if (!(key in lightThemeVars) || !(key in darkThemeVars)) unknown.push(key);
      }
    }
    expect([...new Set(unknown)], 'токена нет в теме — пара измеряет пустоту').toEqual([]);
  });

  for (const theme of THEMES) {
    describe(`${theme.name} тема`, () => {
      for (const pair of PAIRS) {
        it(`${pair.where}: ${pair.fg} на ${pair.bg}`, () => {
          const fg = theme.vars[pair.fg] as string;
          const bg = theme.vars[pair.bg] as string;
          const ratio = contrastRatio(fg, bg);
          expect(
            ratio,
            `цвет не разобран как #rrggbb: ${pair.fg}=${fg}, ${pair.bg}=${bg}`
          ).not.toBeNull();
          expect(
            Number((ratio as number).toFixed(2)),
            `${pair.where}: ${fg} на ${bg} даёт ${(ratio as number).toFixed(2)}:1, нужно ${pair.min}:1`
          ).toBeGreaterThanOrEqual(pair.min);
        });
      }
    });
  }
});
