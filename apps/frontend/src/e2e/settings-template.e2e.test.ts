import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';

/**
 * `TPL-005`: настройки собраны по шаблону «оглавление + содержимое», и оглавление не врёт.
 *
 * Экран настроек — единственный, где ТЗ §7.5 предписывает свою раскладку: список разделов
 * слева колонкой, содержимое справа; на 1024px список становится верхним рядом, на 360px —
 * выпадающим списком. Смысл именно в колонке: разделов шестнадцать, и на широком экране
 * человек должен видеть их все сразу, а не листать стопку блоков сверху вниз.
 *
 * Вторая проверка — про честность оглавления. Часть разделов живёт своими маршрутами
 * (ссылка), часть встроена в экран (якорь `#payments`). Якорь, которому не соответствует
 * блок на странице, — это ссылка в никуда: человек жмёт «Оплата», страница не двигается, и
 * понять, сломано что-то или так задумано, невозможно. Обратная сторона тоже проверяется:
 * встроенный блок без строки в оглавлении не найти ничем, кроме прокрутки.
 */

const SCREEN = fromApp('src', 'features', 'settings', 'settings-screen.tsx');
const MODEL = fromApp('src', 'features', 'settings', 'sections.ts');

/** Исходник без комментариев: пояснение над экраном не должно считаться разметкой. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const screen = codeOnly(readFileSync(SCREEN, 'utf8'));
const model = codeOnly(readFileSync(MODEL, 'utf8'));

/** Разделы без `href` — те, что встроены в экран якорем. */
const anchorSections = (): string[] =>
  [...model.matchAll(/\{\s*id:\s*'([a-z-]+)'[^}]*\}/g)]
    .filter((match) => !/href:/.test(match[0] ?? ''))
    .map((match) => match[1] ?? '');

/** Блоки-якоря, реально отрисованные на экране. */
const renderedAnchors = (): string[] =>
  [...screen.matchAll(/<div id="([a-z-]+)">/g)].map((match) => match[1] ?? '');

describe('TPL-005 · настройки: оглавление слева и без ссылок в никуда', () => {
  it('модель разделов прочитана, а не пропущена молча', () => {
    expect(anchorSections().length).toBeGreaterThan(3);
    expect(renderedAnchors().length).toBeGreaterThan(3);
  });

  it('экран собран раскладкой шаблона, а не стопкой блоков', () => {
    expect(/<SettingsLayout\b/.test(screen)).toBe(true);
  });

  it('у каждого якоря из оглавления есть блок на экране', () => {
    const dead = anchorSections().filter((id) => !renderedAnchors().includes(id));
    expect(dead).toEqual([]);
  });

  it('у каждого блока на экране есть строка в оглавлении', () => {
    const hidden = renderedAnchors().filter((id) => !anchorSections().includes(id));
    expect(hidden).toEqual([]);
  });
});
