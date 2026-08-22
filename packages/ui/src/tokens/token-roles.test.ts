import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { lightThemeVars } from './index.js';
import { uiGlobalStyles } from '../styles/index.js';

/**
 * `UI-002`: у каждой переменной темы есть роль — то есть место, где она применяется.
 *
 * История требования: шесть нейтралей `--ui-neutral-50/100/300/500/700/900` были объявлены
 * «на вырост» и не имели описанного назначения. Четыре из них не использовались вообще —
 * ни в стилях, ни в компонентах, ни во фронте. Мёртвый токен хуже бесполезного: тот, кто
 * подбирает цвет, видит шкалу из шести ступеней и думает, что все они что-то значат.
 *
 * Сторож держит правило «объявлено — значит применяется» для ВСЕХ токенов темы, а не только
 * нейтралей: следующий «токен на вырост» покраснеет здесь же.
 *
 * Оговорка: `baseVars` (типографика, отступы) сторож сознательно не трогает. Пять токенов из
 * записи 163 срез 29 применил (потолок контента, веса, интерлиньяж — их держит сторож
 * `type-rhythm`); из неприменённых остались `--ui-space-xl`/`--ui-space-xxl` — это отступы
 * контекстов «карточка» и «дашборд/форма» из `UI-016`, ещё не начатого.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_SRC = join(HERE, '..');

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(full)) continue;
    if (full.includes('.test.')) continue;
    // Сам файл объявлений не считается применением.
    if (full.endsWith(join('tokens', 'index.ts'))) continue;
    acc.push(full);
  }
  return acc;
};

describe('UI-002 · у каждого токена темы есть место применения', () => {
  const sources = collect(PACKAGE_SRC).map((file) => readFileSync(file, 'utf8'));
  const blob = sources.join('\n');

  it('сторож видит исходники пакета', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it.each(Object.keys(lightThemeVars))('%s применяется в пакете', (token) => {
    // Граница после имени обязательна: иначе «--ui-neutral-50» находился бы как
    // префикс «--ui-neutral-500» — ровно так разведка этого среза сначала и соврала.
    const usage = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9a-zA-Z-])`);
    expect(usage.test(blob), `токен ${token} объявлен, но не применяется нигде`).toBe(true);
  });

  it('шкала нейтралей — ровно две ступени с ролями: 500 (статус) и 900 (подложка медиа)', () => {
    const neutrals = Object.keys(lightThemeVars).filter((k) => k.startsWith('--ui-neutral-'));
    expect(neutrals.sort()).toEqual(['--ui-neutral-500', '--ui-neutral-900']);
  });
});

/**
 * `UI-003`: на экране один акцент действия. Коралл — только у первичной кнопки
 * (и у героя, чья CTA и есть первичное действие стартового экрана); всё остальное —
 * структура (индиго), нейтраль, опасность или статус.
 *
 * До этого среза коралл стоял ещё и в декоративной полосе карточки курса: в сетке из
 * десяти карточек это десять кораллиновых пятен на экран — акцент переставал быть одним.
 */
const CORAL = ['var(--ui-accent-600)', 'var(--ui-accent-700)'];
const CORAL_ALLOWED = ['.ui-button--primary', '.ui-button-primary', '.ui-hero__cta'];

describe('UI-003 · коралл только у первичного действия', () => {
  it('акцентные переменные встречаются лишь в правилах первичной кнопки и CTA героя', () => {
    const offenders: string[] = [];
    let selector = '(начало файла)';
    for (const line of uiGlobalStyles.split('\n')) {
      const trimmed = line.trim();
      const asSelector = /^([.#a-z][^{]*)\{/.exec(trimmed);
      if (asSelector) selector = asSelector[1]!.trim();
      if (!CORAL.some((token) => trimmed.includes(token))) continue;
      const where = asSelector ? asSelector[1]!.trim() : selector;
      if (!CORAL_ALLOWED.some((allowed) => where.includes(allowed))) {
        offenders.push(where);
      }
    }
    expect(offenders, `коралл вне первичного действия:\n${offenders.join('\n')}`).toEqual([]);
  });
});
