import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `GOAL-4` · «композиций дизайн-системы в админских экранах: 4 файла → все реестры».
 *
 * Что считается реестром. Экран с шапкой и **ровно одной** таблицей: у него есть фильтры,
 * состояния загрузки/ошибки/пустоты и, возможно, страницы — ровно то, что собрано в
 * `ListPage`. Дашборд с несколькими таблицами (`/workspace`, выгрузки в госреестры) сюда
 * не попадает: там таблица — часть блока, а не сам экран, и `ListPage` ему не каркас.
 *
 * Почему храповик, а не запрет. Реестров два десятка, перевод каждого — это ещё и разбор
 * колонок (в них находятся сырые коды и идентификаторы), поэтому за один шаг это не
 * делается. Список ниже — те, кто ещё не переехал. Он сверяется на равенство: новый
 * реестр в него не попадёт, а переведённый обязан из него уйти.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

/** Реестры, ещё не переведённые на `ListPage`. Список только сокращается. */
const PENDING = [
  'src/features/assessment-admin/question-bank-detail-screen.tsx',
  'src/features/commissions/commissions-screens.tsx',
  'src/features/groups/groups-list-screen.tsx',
  'src/features/learners/learner-detail-screen.tsx',
  'src/features/learners/learners-list-screen.tsx',
  'src/features/payments/screens.tsx'
];

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (!full.endsWith('.tsx')) continue;
    if (full.includes('.test.')) continue;
    acc.push(full);
  }
  return acc;
};

/** Экран с шапкой и ровно одной таблицей, собранной вручную. */
const isHandMadeRegistry = (source: string): boolean => {
  if (!source.includes('<PageHeader')) return false;
  if (/<ListPage[\s>]/.test(source)) return false;
  return (source.match(/<DataTable/g) ?? []).length === 1;
};

describe('GOAL-4 · реестры переезжают на каркас дизайн-системы', () => {
  const files = [join(FRONTEND, 'src'), join(FRONTEND, 'app')].flatMap((root) => collect(root));

  const handMade = files
    .filter((file) => isHandMadeRegistry(readFileSync(file, 'utf8')))
    .map((file) => relative(FRONTEND, file).split(sep).join('/'))
    .sort();

  it('сторож видит экраны приложения', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('список непереведённых реестров совпадает с действительностью', () => {
    const added = handMade.filter((file) => !PENDING.includes(file));
    const done = PENDING.filter((file) => !handMade.includes(file));

    expect(added, `новый реестр собран вручную вместо ListPage:\n${added.join('\n')}`).toEqual([]);
    expect(
      done,
      `эти реестры уже переехали — вычеркните их из PENDING:\n${done.join('\n')}`
    ).toEqual([]);
  });

  it('остаток виден числом и обязан убывать', () => {
    // Волны 1–3 (срезы 40–42): 4 + 2 + 4 реестра. Остаток — крупные экраны с несколькими
    // таблицами и «эталоны» фазы 2, которым нужен отдельный разбор.
    expect(PENDING.length).toBeLessThanOrEqual(6);
  });
});
