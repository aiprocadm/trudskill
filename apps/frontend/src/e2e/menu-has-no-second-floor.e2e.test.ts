import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * В меню нет второго этажа (ТЗ «Стабилизация, UX и развитие», 3.1 / Н1).
 *
 * **Как было.** У администратора центра меню показывало семь строк, под ними кнопку «Ещё», а
 * под «Ещё» — девять групп и около пятидесяти пунктов. Человек видел семь строк и делал
 * единственный возможный вывод: в системе семь разделов. Раскрытие «Ещё» при этом жило только
 * до перехода на другую страницу — то есть каждый раз приходилось искать заново.
 *
 * **Критерий приёмки ТЗ дословно:** «Слова „Ещё“ в навигации нет ни у одной роли». Проверяем
 * именно это — по всем файлам оболочки, а не по одному: убрать слово в одном месте и забыть в
 * соседнем — самый частый способ вернуть дефект.
 *
 * Комментарии снимаются: пояснение «как было» в самом файле не должно ронять проверку — на этой
 * грабле в репозитории уже обжигались (§5.456).
 */

const SHELL_DIR = fromApp('src', 'widgets', 'shell');
const APP_SHELL = join(SHELL_DIR, 'app-shell.tsx');

const shellFiles = (): string[] =>
  readdirSync(SHELL_DIR)
    .filter((entry) => entry.endsWith('.tsx') && !entry.includes('.test.'))
    .map((entry) => join(SHELL_DIR, entry))
    .filter((full) => statSync(full).isFile());

const codeOf = (file: string): string => stripComments(readFileSync(file, 'utf8'));

describe('меню без второго этажа (ТЗ 3.1)', () => {
  it('сторож видит файлы оболочки', () => {
    expect(
      shellFiles().length,
      'каталог оболочки не найден — проверка смотрит в пустоту'
    ).toBeGreaterThan(2);
  });

  it('слова «Ещё» в навигации нет ни в одном файле оболочки', () => {
    const offenders = shellFiles().filter((file) => /Ещё/.test(codeOf(file)));
    expect(
      offenders.map((file) => file.split('/').pop()),
      'критерий приёмки ТЗ 3.1 дословно: слова «Ещё» в навигации нет ни у одной роли'
    ).toEqual([]);
  });

  it('группы стоят прямо в меню, а не внутри раскрывающейся обёртки', () => {
    const code = codeOf(APP_SHELL);
    const navStart = code.indexOf('app-shell__nav');
    const navEnd = code.indexOf('</nav>');
    const nav = code.slice(navStart, navEnd);

    expect(nav.length, 'разметка меню не найдена').toBeGreaterThan(0);
    expect(
      /moreGroups\.map\(/.test(nav),
      'группы обязаны перечисляться прямо в меню: за одной кнопкой они были невидимы'
    ).toBe(true);
    expect(
      /app-shell__more-toggle|app-shell__more-panel/.test(nav),
      'обёртка второго этажа обязана исчезнуть вместе со словом'
    ).toBe(false);
  });

  it('раскрытие групп переживает переход на другую страницу', () => {
    const code = codeOf(APP_SHELL);
    expect(
      /readOpenGroups\(window\.localStorage\)/.test(code) &&
        /writeOpenGroups\(window\.localStorage/.test(code),
      'ТЗ требует запоминать раскрытие между переходами: раньше состояние жило до первого же ' +
        'перехода, и человек искал раздел заново каждый раз'
    ).toBe(true);
  });

  it('состояние читается ПОСЛЕ монтирования — иначе разъедется гидрация', () => {
    /*
     * На сервере хранилища браузера нет. Прочитать его при первом рендере значит получить
     * разную разметку на сервере и в браузере — та же грабля, что у подсказки меню.
     */
    const code = codeOf(APP_SHELL);
    const readAt = code.indexOf('readOpenGroups(window.localStorage)');
    const effectAt = code.lastIndexOf('useEffect(', readAt);
    expect(effectAt, 'чтение хранилища обязано жить внутри эффекта').toBeGreaterThan(-1);
    expect(
      readAt - effectAt,
      'чтение должно быть в ближайшем эффекте, а не где-то далеко'
    ).toBeLessThan(200);
  });
});
