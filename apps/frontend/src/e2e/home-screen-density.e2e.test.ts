import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ROLE_HOME_ROUTES } from '../features/navigation/role-home';

/**
 * `GOAL-3` · «блоков на первом экране: 5 → ≤3».
 *
 * Домашний экран — единственный, который человек видит каждый день и не выбирал. Если на
 * нём пять равнозначных блоков, ответа на вопрос «с чего начать» нет: взгляд идёт по
 * порядку сверху вниз, а не туда, где работа.
 *
 * Цель говорит про **первый экран** — то, что видно без прокрутки. Раньше эта граница
 * жила комментарием `{/* Зона 3 — ниже сгиба *\/}`, то есть держалась на памяти. Теперь
 * она разметочная (`BelowFold`), и сторож считает блоки до неё.
 *
 * Считаются блоки верхнего уровня: карточка секции (`SectionCard`), сетка плиток
 * (`ui-dashboard-grid`) — как один блок, сколько бы плиток в ней ни было, — и виджет
 * внимания. Шапка страницы блоком не считается: она отвечает на «где я», а не «что тут».
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

/**
 * Домашний маршрут → файл, который его рисует. Список ведётся руками намеренно: связь
 * «адрес → компонент» в Next.js не выводится из кода без сборки, а угадывание по имени
 * папки молча пропустило бы экран, вынесенный в `features/`.
 */
const HOME_SOURCES: Record<string, string> = {
  '/learner': 'src/features/learner-home/learner-home-screen.tsx',
  '/workspace': 'app/workspace/page.tsx',
  '/methodist': 'app/methodist/page.tsx',
  '/groups': 'src/features/groups/groups-list-screen.tsx',
  '/counterparty-portal': 'app/counterparty-portal/page.tsx'
};

/** Часть файла до `BelowFold` — то, что человек видит, не прокручивая. */
const aboveFold = (source: string): string => {
  const index = source.indexOf('<BelowFold');
  return index === -1 ? source : source.slice(0, index);
};

const countBlocks = (source: string): number => {
  const above = aboveFold(source);
  const sections = (above.match(/<SectionCard/g) ?? []).length;
  const grids = (above.match(/ui-dashboard-grid/g) ?? []).length;
  const attention = (above.match(/<AttentionWidget/g) ?? []).length;
  return sections + grids + attention;
};

describe('GOAL-3 · на первом экране не больше трёх блоков', () => {
  it('у каждой роли домашний маршрут описан файлом — иначе мерить нечего', () => {
    const missing = ROLE_HOME_ROUTES.map((entry) => entry.href)
      .filter((href, index, all) => all.indexOf(href) === index)
      .filter((href) => !HOME_SOURCES[href]);

    expect(
      missing,
      `появился домашний маршрут без файла в HOME_SOURCES:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('файлы домашних экранов существуют', () => {
    const gone = Object.entries(HOME_SOURCES)
      .filter(([, file]) => !existsSync(join(FRONTEND, file)))
      .map(([href, file]) => `${href} → ${file}`);

    expect(gone, `экран переехал, поправьте HOME_SOURCES:\n${gone.join('\n')}`).toEqual([]);
  });

  it('блоков до сгиба — не больше трёх', () => {
    const over = Object.entries(HOME_SOURCES)
      .map(([href, file]) => ({
        href,
        count: countBlocks(readFileSync(join(FRONTEND, file), 'utf8'))
      }))
      .filter((row) => row.count > 3);

    expect(
      over.map((row) => `${row.href}: ${row.count}`),
      'на этих домашних экранах больше трёх блоков сразу. Уберите лишнее под <BelowFold> ' +
        'или объедините блоки — но не прячьте работу, к которой человек приходит каждый день.'
    ).toEqual([]);
  });

  it('мерка не выродилась: хотя бы один экран действительно пользуется сгибом', () => {
    // Если `BelowFold` исчезнет отовсюду, проверка выше начнёт проходить по построению
    // на экранах, которые просто стали короче. Этот тест держит саму метрику живой.
    const withFold = Object.values(HOME_SOURCES).filter((file) =>
      readFileSync(join(FRONTEND, file), 'utf8').includes('<BelowFold')
    );

    expect(withFold.length).toBeGreaterThan(0);
  });
});
