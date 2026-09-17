import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { buildBreadcrumbs } from '../features/navigation/breadcrumbs';
import { navigationModel } from '../features/navigation/model';
import { TAB_TITLE_SEPARATOR, tabTitle } from '../features/navigation/tab-title';

/**
 * Заголовок вкладки = пункт меню = заголовок страницы = последняя крошка (ТЗ «Стабилизация, UX и
 * развитие», 4.3 / Я3).
 *
 * **Как было.** `<title>` не задавала ни одна из 102 страниц, корневая раскладка — тоже
 * (журнал 394, проверено на стенде: тега нет ни на `/`, ни на `/login`, ни на `/learners`).
 *
 * **Что закреплено.** Меню и заголовок страницы сверяет `one-section-one-name` (3.4), крошки —
 * `breadcrumbs-name-the-object` (3.5). Здесь замыкается четвёртое место: вкладка называет раздел
 * ИЗ ТЕХ ЖЕ КРОШЕК, в одном месте (оболочка), а до гидрации её называет запасной `<title>`
 * корневой раскладки. Проверяется по реестру: для каждого пункта меню вкладка начинается с его
 * имени.
 */

const SHELL = fromApp('src', 'widgets', 'shell', 'app-shell.tsx');
const LAYOUT = fromApp('app', 'layout.tsx');

describe('вкладка называет раздел (ТЗ 4.3)', () => {
  it('для каждого пункта меню вкладка начинается с его имени из реестра', () => {
    const mismatched = navigationModel
      .map((item) => ({ item, title: tabTitle(buildBreadcrumbs(item.href), 'Центр') }))
      .filter(({ item, title }) => title !== `${item.label}${TAB_TITLE_SEPARATOR}Центр`)
      .map(({ item, title }) => `${item.href}: «${title}» вместо «${item.label} — Центр»`);
    expect(
      mismatched,
      'имя во вкладке обязано совпадать с пунктом меню — оба берутся из реестра navigationModel'
    ).toEqual([]);
  });

  it('карточка: имя объекта, затем раздел; пока имя едет — раздел', () => {
    const ready = buildBreadcrumbs('/learners/learner_89ydse8s', {
      status: 'ready',
      name: 'Иванов Иван Иванович'
    });
    expect(tabTitle(ready, 'Центр')).toBe('Иванов Иван Иванович — Слушатели — Центр');
    expect(ready.at(-1)?.object, 'крошка карточки помечена как объект').toBe(true);
    expect(tabTitle(buildBreadcrumbs('/learners/learner_89ydse8s'), 'Центр')).toBe(
      'Слушатели — Центр'
    );
  });

  it('оболочка ставит заголовок вкладки из тех же крошек, что рисует над страницей', () => {
    const shell = stripComments(readFileSync(SHELL, 'utf8'));
    const effect =
      /useEffect\(\(\)\s*=>\s*\{\s*document\.title\s*=\s*tabTitle\(breadcrumbItems,\s*wordmark\);/;
    expect(
      effect.test(shell),
      'document.title обязан вычисляться из breadcrumbItems — иначе вкладка и крошки разойдутся'
    ).toBe(true);
    expect(
      /const wordmark = resolveWordmark\(branding\)/.test(shell),
      'во вкладке — имя центра'
    ).toBe(true);
  });

  it('до гидрации вкладку называет запасной заголовок корневой раскладки', () => {
    const layout = stripComments(readFileSync(LAYOUT, 'utf8'));
    expect(
      /title:\s*\{\s*default:\s*'trudskill'/.test(layout),
      'без `title` в metadata страницы входа и ошибок остаются безымянными (журнал 394)'
    ).toBe(true);
  });
});
