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
 * Экраны, которым переходный слот ещё разрешён. **Список пуст: волна 3 (срез 35) увела
 * последние пять.** Сторож остаётся и после переезда: теперь он держит уже не остаток, а
 * запрет — ни один экран не может вернуться к слоту `actions` в обход `primaryAction`.
 *
 * Путь трёх волн: 26 экранов → 15 (волна 1) → 5 (волна 2) → 0 (волна 3). Пути — от
 * `apps/frontend`, разделитель прямой слэш.
 */
const ALLOWED: string[] = [];

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

  it('остаток CMP-020 — ноль: переходный слот закрыт', () => {
    // Число обязано было уменьшаться и дошло до нуля. Дальше сторож работает запретом:
    // непустой список — это возврат долга, а не «временное исключение».
    expect(ALLOWED).toEqual([]);
  });
});
