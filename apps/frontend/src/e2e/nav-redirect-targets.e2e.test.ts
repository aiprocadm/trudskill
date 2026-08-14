import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { navigationModel } from '../features/navigation/model';
import { NAV_GROUPS } from '../features/navigation/nav-groups';

/**
 * Пункт меню не ведёт на перенаправление (`IA-017`).
 *
 * Срезы 1, 3 и 4 убрали дубли экранов, превратив адреса в редиректы: `/admin/learners`
 * → `/learners`, `/admin/cockpit` → `/workspace`, три адреса настроек провайдеров → якоря `/settings`.
 * Адреса сохранены ради закладок — а вот **пункты меню остались**, и человек по-прежнему
 * видел два входа в один раздел. Дубль убрали из адресной строки, но не с глаз.
 *
 * Список страниц-перенаправлений не выписан руками: он вычисляется по коду, поэтому
 * не может устареть. Новый редирект без чистки меню уронит этот прогон.
 */

const APP_DIR = 'app';

/** Страница-перенаправление: в теле только `redirect(...)`, разметки нет. */
const isRedirectPage = (file: string): boolean => {
  const source = readFileSync(file, 'utf8');
  return source.includes('redirect(') && !source.includes('return (');
};

const routeOf = (file: string): string => {
  const rel = relative(APP_DIR, file).split(sep).slice(0, -1).join('/');
  return `/${rel}`.replace(/\/$/, '') || '/';
};

const collectPages = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectPages(full, acc);
      continue;
    }
    if (entry === 'page.tsx') acc.push(full);
  }
  return acc;
};

const redirectRoutes = collectPages(APP_DIR).filter(isRedirectPage).map(routeOf).sort();

describe('меню не ведёт на перенаправления (IA-017)', () => {
  it('в приложении есть страницы-перенаправления — иначе проверять нечего', () => {
    // Защита от «сторож зелёный, потому что ничего не нашёл».
    expect(redirectRoutes.length).toBeGreaterThan(0);
  });

  it('ни один пункт меню не ведёт на перенаправление', () => {
    const offenders = navigationModel
      .filter((item) => redirectRoutes.includes(item.href))
      .map((item) => `${item.label} → ${item.href}`);
    expect(offenders, 'пункт меню ведёт на редирект — уберите дубль из меню').toEqual([]);
  });

  it('блоки информационной архитектуры тоже не ссылаются на перенаправления', () => {
    const offenders = NAV_GROUPS.flatMap((group) =>
      group.hrefs.map((href) => ({ group: group.label, href }))
    )
      .filter((entry) => redirectRoutes.includes(entry.href))
      .map((entry) => `${entry.group} → ${entry.href}`);
    expect(offenders).toEqual([]);
  });
});
