import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { uiStyleLayers } from '@trudskill/ui';
import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * Телефон — не «тоже поддерживается», а основной экран слушателя
 * (ТЗ «Стабилизация, UX и развитие», 6.6 / С6, 14.2, 14.3).
 *
 * **Три находки сверки.**
 *
 * 1. **`100vh` — это высота экрана БЕЗ панелей браузера, то есть больше видимой части.**
 *    Боковая панель задана `position: fixed; height: 100vh`, а её низ — закреплённая строка с
 *    «Сохранить» и «Отмена» (их туда перенесла задача 5.13, чтобы человек их не пропустил). На
 *    телефоне этот низ оказывался ПОД панелью браузера: кнопка есть, нажать нельзя (журнал 505).
 *    То же у оглавления курса и ленты сообщений — их последние строки уходили под панель.
 * 2. **Безопасные зоны телефона не учитывались нигде** (журнал 506): ни выреза сверху, ни
 *    системной полосы снизу. Панель массовых действий прижата к низу экрана — в режиме приложения
 *    на iPhone (`appleWebApp.capable` включён) её кнопки попадали под системную полосу.
 * 3. **Клавиатура под поле не выбиралась** (журнал 507): СНИЛС, телефон и почта открывали общую
 *    буквенную клавиатуру. На 360 px это ошибки в номере, который потом уходит в документ.
 */

const SRC = fromApp('src');

/** Все экраны приложения, кроме тестов. */
const screens = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      screens(full, acc);
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

/**
 * Тела тегов `<input …>` в файле.
 *
 * Границу тега ищем по балансу фигурных скобок, а не «до первой `>`»: внутри тега живут
 * стрелочные функции `(e) => …`, и наивный разбор обрывается на их стрелке — правка есть, а
 * замер её не видит (журнал 508, на этом обжёгся сам сканер сверки).
 */
const inputTags = (source: string): string[] => {
  const tags: string[] = [];
  for (let i = source.indexOf('<input'); i !== -1; i = source.indexOf('<input', i + 1)) {
    let depth = 0;
    for (let j = i; j < source.length; j += 1) {
      const ch = source[j];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) {
        tags.push(source.slice(i, j + 1));
        break;
      }
    }
  }
  return tags;
};

/** Поле про СНИЛС, телефон или почту — по любому признаку внутри самого тега. */
const KEYBOARD_FIELDS: { kind: string; marker: RegExp; mode: RegExp }[] = [
  { kind: 'СНИЛС', marker: /snils/i, mode: /inputMode="numeric"/ },
  { kind: 'телефон', marker: /phone|tel"/i, mode: /inputMode="tel"/ },
  { kind: 'почта', marker: /type="email"/i, mode: /inputMode="email"/ }
];

describe('телефон — основной экран слушателя (ТЗ 6.6, 14.2, 14.3)', () => {
  it('высота коробок считается по ВИДИМОЙ части экрана, а не по «100vh»', () => {
    const all = Object.values(uiStyleLayers).join('\n');
    expect(
      all.includes('100vh'),
      'на телефоне 100vh больше видимой части: низ закреплённой панели уходит под панель браузера'
    ).toBe(false);
    expect(all, 'динамическая высота обязана использоваться').toContain('100dvh');
  });

  it('элементы, прижатые к краю экрана, знают про вырез и системную полосу', () => {
    expect(
      uiStyleLayers.tables,
      'панель массовых действий стоит внизу экрана — её кнопки попадали под системную полосу'
    ).toContain('env(safe-area-inset-bottom');
    expect(
      uiStyleLayers.foundation,
      'полоса режима экзамена стоит вверху: таймер обязан быть виден всегда'
    ).toContain('env(safe-area-inset-top');
    expect(
      uiStyleLayers.shell,
      'кнопка меню на телефоне прижата к верхнему углу — под вырез ей нельзя'
    ).toContain('env(safe-area-inset-top');
  });

  it('страница занимает экран целиком, иначе поправки на безопасные зоны бессмысленны', () => {
    const layout = stripComments(readFileSync(fromApp('app', 'layout.tsx'), 'utf8'));
    expect(layout, 'без этого браузер сам сжимает страницу и env(...) всегда ноль').toContain(
      "viewportFit: 'cover'"
    );
  });

  it('каждое поле СНИЛС, телефона и почты открывает свою клавиатуру', () => {
    const missing: string[] = [];
    for (const file of screens(SRC)) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const tag of inputTags(source)) {
        for (const field of KEYBOARD_FIELDS) {
          if (!field.marker.test(tag)) continue;
          if (!field.mode.test(tag)) {
            missing.push(`${file.slice(file.indexOf('src/'))} — ${field.kind}`);
          }
        }
      }
    }
    expect(missing, 'на 360 px общая буквенная клавиатура — это ошибки в номере').toEqual([]);
  });

  it('разбор тега не ломается о стрелочную функцию внутри него', () => {
    // Сторож самого замера: наивное «до первой >» обрывалось на `(e) => …` (журнал 508).
    const tags = inputTags('<input value={x} onChange={(e) => set(e)} inputMode="numeric" />');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('inputMode="numeric"');
  });

  it('экран экзамена на телефоне: переходы — полноценные тач-зоны', () => {
    /* Телефонных блоков в этом слое НЕСКОЛЬКО — берём все, а не первый: правило про
       навигацию теста живёт во втором, и проверка «по [1]» его не видела. */
    const phone = uiStyleLayers.foundation.split('@media (max-width: 480px)').slice(1).join('\n');
    expect(phone, '«Назад» и «Следующий вопрос» растягиваются на всю ширину').toContain(
      '.test-nav > *'
    );
    expect(uiStyleLayers.foundation, 'номера вопросов в карте — не меньше 44px (ФТ-H4)').toContain(
      '.exam-map__item { min-width: 44px; min-height: 44px;'
    );
  });

  it('план фазы 6 записан', () => {
    const plan = readFileSync(
      fromApp(
        '..',
        '..',
        'docs',
        'superpowers',
        'plans',
        '2026-09-18-stabux-phase-6-learner-cabinet.md'
      ),
      'utf8'
    );
    expect(plan).toContain('6.6');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Задача 5');
  });
});
