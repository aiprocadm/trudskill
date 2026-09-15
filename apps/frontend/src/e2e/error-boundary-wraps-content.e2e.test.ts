import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * Падение блока не уносит страницу (ТЗ «Стабилизация, UX и развитие», 1.1.4).
 *
 * Перехватчик обязан стоять ВНУТРИ оболочки: тогда падение содержимого оставляет человеку
 * меню, крошки и выход. Если обернуть им страницу СНАРУЖИ оболочки, поведение вернётся к
 * прежнему — голый экран без единого способа уйти, то самое «человек выпадает из системы».
 *
 * Второе: `app/global-error.tsx` перехватывает падение самой корневой раскладки. Его не было
 * вовсе (журнал 395), и такое падение показывало служебный экран браузера.
 */

const SHELL = fromApp('src', 'widgets', 'shell', 'app-shell.tsx');
const GLOBAL_ERROR = fromApp('app', 'global-error.tsx');

describe('перехватчик падений стоит там, где нужно', () => {
  it('содержимое страницы обёрнуто перехватчиком внутри оболочки', () => {
    const code = stripComments(readFileSync(SHELL, 'utf8'));

    expect(
      /<ErrorBoundary[^>]*>\s*\{children\}\s*<\/ErrorBoundary>/.test(code),
      'содержимое страницы обязано быть обёрнуто ErrorBoundary — иначе падение блока уносит меню'
    ).toBe(true);

    /* Перехватчик — ВНУТРИ разметки оболочки, а не вокруг неё. */
    const boundaryAt = code.indexOf('<ErrorBoundary');
    const navAt = code.indexOf('app-shell__nav');
    expect(
      navAt !== -1 && boundaryAt > navAt,
      'перехватчик стоит после навигации: он закрывает содержимое, а не всю оболочку'
    ).toBe(true);
  });

  it('падение корневой раскладки перехвачено собственной страницей', () => {
    expect(
      existsSync(GLOBAL_ERROR),
      'app/global-error.tsx обязателен: без него падение раскладки показывает экран браузера'
    ).toBe(true);

    const code = stripComments(readFileSync(GLOBAL_ERROR, 'utf8'));
    expect(code, 'человеку нужно действие').toContain('Повторить');
    expect(code, 'своя раскладка: App Router требует html и body').toContain('<html');
  });
});
