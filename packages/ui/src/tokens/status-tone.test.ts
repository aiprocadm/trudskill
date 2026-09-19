import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast.js';
import { darkThemeVars, lightThemeVars, semanticStatusTone } from './index.js';

import type { StatusTone } from './index.js';

/**
 * Плашки статусов — фирменные и читаемые (ТЗ «Стабилизация, UX и развитие», 7.2 / В2).
 *
 * **Что было.** Плашка рисовалась НАСЫЩЕННЫМ фоном и белым текстом, причём белый стоял
 * хардкодом в `.ui-badge`, а фон подставлялся встроенным стилем прямо в разметке — мимо
 * токенов. Встроенный стиль не умеет меняться вместе с темой, и в тёмной теме получалось
 * белым по светло-зелёному: **1.97:1** при пороге 4.5:1. Так все шесть цветов, худший 1.97,
 * лучший 3.67. То есть в тёмной теме НИ ОДНА плашка статуса не проходила AA, а сторож
 * контрастов этого не видел: пары «текст плашки на фоне плашки» в его списке не было
 * (журнал 561).
 *
 * **Что закреплено.** Пять тонов, у каждого пара «приглушённый фон + насыщенный текст»,
 * своя в каждой теме. Цвет приходит КЛАССОМ, а не встроенным стилем. Ни одного нового
 * значения сверх пяти: набор закрыт, иначе «фирменная палитра» через полгода снова станет
 * россыпью оттенков.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (...parts: string[]) => readFileSync(resolve(here, '..', ...parts), 'utf8');

const TONES: StatusTone[] = ['neutral', 'success', 'warning', 'danger', 'off'];
const THEMES = [
  { name: 'светлая', vars: lightThemeVars as Record<string, string> },
  { name: 'тёмная', vars: darkThemeVars as Record<string, string> }
];

describe('тонов ровно пять и набор закрыт (ТЗ 7.2)', () => {
  it('ТЗ назвало пять значений — столько и есть', () => {
    /* «Нейтральный / успех / внимание / ошибка / выключено». Шестого быть не должно. */
    const used = new Set<string>(Object.values(semanticStatusTone));
    expect([...used].sort()).toEqual([...TONES].sort());
  });

  it('у каждого тона есть пара токенов в обеих темах', () => {
    const missing: string[] = [];
    for (const theme of THEMES) {
      for (const tone of TONES) {
        for (const suffix of ['bg', 'text']) {
          const key = `--ui-tone-${tone}-${suffix}`;
          if (!(key in theme.vars)) missing.push(`${theme.name}: ${key}`);
        }
      }
    }
    expect(missing, 'тон без токена — плашка без цвета').toEqual([]);
  });

  it('спокойные состояния не красятся тревожно', () => {
    /*
     * «В архиве», «черновик», «неактивен» — это выведено из работы, а не повод насторожиться.
     * Раньше архив был оранжевым, и человек искал проблему там, где её нет. Правило важнее
     * конкретного тона: ни одно спокойное состояние не должно получить «внимание» или
     * «ошибку».
     */
    for (const status of ['archived', 'draft', 'inactive'] as const) {
      expect(semanticStatusTone[status], `«${status}» окрашен тревожно`).toBe('off');
    }
  });

  it('остановленное не по плану — всегда ошибка', () => {
    /* Заблокирован, приостановлен, отменён, сорвался: человеку нужно вмешаться. */
    for (const status of ['blocked', 'suspended', 'cancelled', 'failed'] as const) {
      expect(semanticStatusTone[status], `«${status}» не помечен ошибкой`).toBe('danger');
    }
  });

  it('хорошо закончившееся — всегда успех', () => {
    for (const status of ['active', 'completed', 'published'] as const) {
      expect(semanticStatusTone[status], `«${status}» не помечен успехом`).toBe('success');
    }
  });

  it('все тринадцать состояний разложены по тонам', () => {
    /*
     * Состояние без тона получило бы «выключено» запасным путём — то есть «в архиве» вместо
     * «заблокирован». Молча и навсегда.
     */
    const unknown = Object.entries(semanticStatusTone).filter(
      ([, tone]) => !TONES.includes(tone as StatusTone)
    );
    expect(unknown).toEqual([]);
    expect(Object.keys(semanticStatusTone).length).toBeGreaterThanOrEqual(13);
  });
});

describe('плашка читается в обеих темах (ТЗ 7.2, WCAG AA)', () => {
  for (const theme of THEMES) {
    for (const tone of TONES) {
      it(`${theme.name} тема: текст тона «${tone}» на его фоне`, () => {
        /*
         * Порог обычного текста 4.5:1, а не 3:1 для крупного: шрифт плашки мелкий
         * (`--ui-font-size-xs`), поблажки для крупного текста к ней не относятся.
         */
        const fg = theme.vars[`--ui-tone-${tone}-text`] as string;
        const bg = theme.vars[`--ui-tone-${tone}-bg`] as string;
        const ratio = contrastRatio(fg, bg);
        expect(ratio, `цвет не разобран: ${fg} / ${bg}`).not.toBeNull();
        expect(
          Number((ratio as number).toFixed(2)),
          `тон «${tone}» в ${theme.name} теме: ${fg} на ${bg} даёт ${(ratio as number).toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('цвет плашки приходит классом, а не встроенным стилем (ТЗ 7.2)', () => {
  const badgeStyles = read('styles', 'foundation.ts');

  it('в общем правиле плашки не задан цвет текста', () => {
    /*
     * Прежде там стоял `color: #fff` — тот самый белый, из-за которого тёмная тема и
     * провалилась. Цвет текста обязан приходить от тона, иначе тон бессилен.
     */
    const rule = badgeStyles.slice(
      badgeStyles.indexOf('.ui-badge {'),
      badgeStyles.indexOf('.ui-badge--neutral')
    );
    expect(rule, 'в .ui-badge снова прописан цвет текста').not.toMatch(/\bcolor:\s*(#|rgb|white)/);
  });

  it('у каждого тона есть своё правило с фоном и текстом из токенов', () => {
    for (const tone of TONES) {
      const rule = new RegExp(
        `\\.ui-badge--${tone}\\s*{[^}]*background:\\s*var\\(--ui-tone-${tone}-bg\\)[^}]*color:\\s*var\\(--ui-tone-${tone}-text\\)`
      );
      expect(badgeStyles, `у тона «${tone}» нет правила с обоими токенами`).toMatch(rule);
    }
  });

  it('ни один компонент не подставляет цвет плашки встроенным стилем', () => {
    /*
     * Встроенный стиль переживает смену темы: он записан в разметку числом, а тема меняет
     * токены. Именно так плашки и застряли на белом тексте. Проверяем постройку
     * «ui-badge ... style», а не слово: одно упоминание класса ничего не доказывает.
     */
    for (const file of [
      ['components', 'badges', 'index.tsx'],
      ['components', 'async-status', 'index.tsx']
    ]) {
      const source = read(...file);
      expect(source, `${file.join('/')}: цвет плашки задан встроенным стилем`).not.toMatch(
        /className="ui-badge"[\s\S]{0,120}style={{[\s\S]{0,80}background/
      );
    }
  });
});
