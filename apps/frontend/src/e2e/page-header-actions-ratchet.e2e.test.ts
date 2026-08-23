import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `CMP-020` · переходный слот `actions` в шапке страницы только сокращается.
 *
 * Как устроен переезд. Каркас страницы переехал в `@trudskill/ui` (`CMP-015`), и шапка
 * получила контракт из ТЗ §6.3: `primaryAction` — **не массив**, остальное в меню «Ещё».
 * Перевести 27 экранов одним PR нельзя (ТЗ ограничивает фазу ~30 файлами), поэтому старый
 * слот `actions` оставлен на время волн. Опасность известна: «временное» переживает всех,
 * если его никто не считает.
 *
 * Сторож считает. Список ниже — экраны, которым слот ещё разрешён. Новый файл в него попасть
 * не может: список сверяется на равенство, а не на вхождение. Переведённый экран обязан из
 * списка уйти — иначе сторож краснеет с просьбой вычеркнуть строку. Так список не врёт:
 * его длина и есть честный остаток `CMP-020`.
 *
 * ⚠️ Этот сторож был **обещан комментарием в пакете на срез раньше, чем написан**: в
 * `page-shell.tsx` уже стояло «список оставшихся держит сторож `page-header-actions-ratchet`»,
 * а сторожа не существовало. Расхождение записано в журнал (запись 172).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

/**
 * Экраны, которым переходный слот ещё разрешён. Волна 1 (срез 33) сняла отсюда 11 экранов
 * с одним первичным действием. Остаток — случаи, требующие решения: два и более действий
 * (нужно выбрать первичное), действия без первичного и слоты, в которых лежит вовсе не
 * действие. Пути — от `apps/frontend`, разделитель прямой слэш.
 */
const ALLOWED = [
  'src/features/courses/courses-screens.tsx',
  'src/features/groups/group-details-screen.tsx',
  'src/features/integrations/screens.tsx',
  'src/features/learners/learner-detail-screen.tsx',
  'src/features/users/users-screens.tsx'
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

/** Шапка страницы вместе с телом: слот ищется только внутри неё, а не по всему файлу. */
const headerBlocks = (source: string): string[] =>
  source.match(/<PageHeader[\s\S]*?(?:\n\s*\/>|<\/PageHeader>)/g) ?? [];

describe('CMP-020 · переходный слот actions только сокращается', () => {
  const files = [join(FRONTEND, 'src'), join(FRONTEND, 'app')].flatMap((root) => collect(root));

  const usingLegacySlot = files
    .filter((file) => headerBlocks(readFileSync(file, 'utf8')).some((b) => b.includes('actions=')))
    .map((file) => relative(FRONTEND, file).split(sep).join('/'))
    .sort();

  it('сторож видит экраны приложения', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('слот используют ровно перечисленные экраны — ни одним больше, ни одним меньше', () => {
    const added = usingLegacySlot.filter((f) => !ALLOWED.includes(f));
    const stale = ALLOWED.filter((f) => !usingLegacySlot.includes(f));

    expect(
      added,
      `новый экран взял переходный слот вместо primaryAction:\n${added.join('\n')}`
    ).toEqual([]);
    expect(
      stale,
      `эти экраны уже переведены — вычеркните их из списка ALLOWED:\n${stale.join('\n')}`
    ).toEqual([]);
  });

  it('остаток CMP-020 виден числом, а не на словах', () => {
    // Волна 1 (срез 33) увела 11 экранов из 26, волна 2 (срез 34) — ещё 10. Число здесь —
    // не украшение: оно обязано уменьшаться, и следующая волна начинается с его правки вниз.
    expect(ALLOWED.length).toBeLessThanOrEqual(5);
  });
});
