import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ФТ-H3 (Фаза 5 Task 5): единые состояния загрузки/пустоты/ошибки — правило,
 * закреплённое тестом, а не договорённостью.
 *
 * Экран из `features/*`, который получает данные (isLoading/isPending/useQuery),
 * обязан рисовать состояния общими обёртками: `AsyncSection`/`ListPage` из
 * `@trudskill/ui` либо `LoadingState`/`SectionError`/`SectionEmpty`/`ListSkeleton`.
 * Самодельные <p>Загрузка…</p> расползаются и ведут себя по-разному — ровно то,
 * что ФТ-H3 запрещает.
 *
 * Гранулярность — файл: если в файле несколько экранов (screens.tsx монолита),
 * достаточно одного использования обёрток, чтобы файл прошёл. Это осознанная
 * грубость: сторож ловит НОВЫЙ экран, написанный целиком мимо обёрток.
 */
const FEATURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'features');

const FETCH_MARKERS = /\b(isLoading|isPending|useQuery)\b/;
const WRAPPER_MARKERS =
  /\b(AsyncSection|ListPage|LoadingState|SectionError|SectionEmpty|ListSkeleton)\b/;

/**
 * Витрина ui-kit — явное исключение по плану Фазы 5 (решение владельца):
 * она ПОКАЗЫВАЕТ состояния как экспонаты, и правило к ней неприменимо по смыслу.
 * Сегодня она проходит правило и так; исключение закреплено, чтобы витрина
 * могла свободно меняться, не ломая сторожа.
 */
const EXCEPTIONS = new Set(['ui-kit/gallery-screen.tsx']);

const isScreenFile = (name: string): boolean =>
  name.endsWith('.tsx') && !name.endsWith('.test.tsx') && name.includes('screen');

const collectScreenFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectScreenFiles(full));
    } else if (isScreenFile(entry)) {
      out.push(full);
    }
  }
  return out;
};

const violatesUnifiedStates = (content: string): boolean =>
  FETCH_MARKERS.test(content) && !WRAPPER_MARKERS.test(content);

describe('единые состояния экранов (ФТ-H3)', () => {
  it('сканер отличает самодельные состояния от общих обёрток', () => {
    const handRolled = `
      const { data, isLoading } = useQuery(...);
      if (isLoading) return <p>Загрузка…</p>;
    `;
    const unified = `
      const { data, isLoading } = useQuery(...);
      if (isLoading) return <LoadingState />;
    `;
    const presentational = 'export const Screen = () => <PageContainer>…</PageContainer>;';
    expect(violatesUnifiedStates(handRolled)).toBe(true);
    expect(violatesUnifiedStates(unified)).toBe(false);
    expect(violatesUnifiedStates(presentational)).toBe(false);
  });

  it('каждый экран с данными в features/* использует общие обёртки', () => {
    const files = collectScreenFiles(FEATURES_DIR);
    // Сторож самого сканера: если экранов «вдруг» стало мало — сломался поиск,
    // а не наступило счастье.
    expect(files.length).toBeGreaterThan(40);

    const offenders = files
      .map((file) => relative(FEATURES_DIR, file).replace(/\\/g, '/'))
      .filter((rel) => !EXCEPTIONS.has(rel))
      .filter((rel) => violatesUnifiedStates(readFileSync(join(FEATURES_DIR, rel), 'utf8')));

    expect(offenders, 'экраны с данными без общих обёрток состояний').toEqual([]);
  });
});
