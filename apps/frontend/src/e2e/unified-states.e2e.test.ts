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
// DetailDrawer (CMP-010) добавлен в Фазе 2: он рисует загрузку, ошибку с повтором и
// содержимое сам — то есть является такой же общей обёрткой состояний, как AsyncSection.
const WRAPPER_MARKERS =
  /\b(AsyncSection|ListPage|LoadingState|SectionError|SectionEmpty|ListSkeleton|DetailDrawer)\b/;

/**
 * Витрина ui-kit — явное исключение по плану Фазы 5 (решение владельца):
 * она ПОКАЗЫВАЕТ состояния как экспонаты, и правило к ней неприменимо по смыслу.
 * Сегодня она проходит правило и так; исключение закреплено, чтобы витрина
 * могла свободно меняться, не ломая сторожа.
 */
const EXCEPTIONS = new Set([
  'features/ui-kit/gallery-screen.tsx',
  /*
   * Очередь долга пуста с фазы 6 среза 7: четыре дровера и модалка переехали на
   * DetailDrawer. Ниже — НЕ очередь, а обоснованные постоянные исключения.
   *
   *
   * Подборщики значений внутри форм — не экраны: загрузка показывается прямо в списке
   * («Загружаем слушателей…»), а обёртки состояний рассчитаны на страницу целиком.
   * Первый попал сюда в Фазе 2; остальные — из срезов 9, 12 и 16, где поля
   * «вставьте идентификатор» заменялись выбором по имени.
   *
   * ⚠️ Сторож видел не все: `course-picker` и `group-picker` используют поле `loading`,
   * а признак сканера — `isLoading`, поэтому они проходили молча. Записаны явно, чтобы
   * слепая зона была видна списком, а не удачей в имени переменной.
   */
  'features/clients/group-counterparty-picker.tsx',
  'features/courses/course-picker.tsx',
  'features/groups/group-picker.tsx',
  'features/learners/learner-picker.tsx',
  // Выбор сотрудника для задач (позиция 6 ТЗ перехода): тот же `DirectorySelect`, что и у групп.
  'features/tasks/staff-select.tsx',
  // Провайдер контекста бренда: данные тянет, но интерфейса не рисует вовсе.
  'features/branding/context.tsx',
  /*
   * Карточка «Недавно выданные документы»: по осознанному решению она СКРЫВАЕТСЯ
   * на время загрузки и при пустом списке (см. комментарий в компоненте) — рисовать
   * скелетон и пустое состояние ей запрещено дизайном, поэтому общие обёртки
   * не применимы. Не очередь.
   */
  'features/learner-home/recent-documents-card.tsx'
]);

/*
 * IA-001 (Фаза 2 редизайна): охват расширен. Прежний сканер брал только `src/features` и
 * только файлы со словом «screen» в имени — вся папка `app/**` (включая `/documents` на
 * 766 строк) и десятки файлов `features/` оставались вне проверки. Правило не может
 * действовать «для файлов с удачным именем».
 */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');

const isScannedFile = (name: string): boolean =>
  name.endsWith('.tsx') && !name.endsWith('.test.tsx');

const collectScreenFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectScreenFiles(full));
    } else if (isScannedFile(entry)) {
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

  it('каждый файл с данными в features/* и app/* использует общие обёртки', () => {
    const files = [
      ...collectScreenFiles(FEATURES_DIR).map((file) => ({
        rel: `features/${relative(FEATURES_DIR, file).replace(/\\/g, '/')}`,
        file
      })),
      ...collectScreenFiles(APP_DIR).map((file) => ({
        rel: `app/${relative(APP_DIR, file).replace(/\\/g, '/')}`,
        file
      }))
    ];
    // Сторож самого сканера: если файлов «вдруг» стало мало — сломался поиск,
    // а не наступило счастье.
    expect(files.length).toBeGreaterThan(150);

    const offenders = files
      .filter((entry) => !EXCEPTIONS.has(entry.rel))
      .filter((entry) => violatesUnifiedStates(readFileSync(entry.file, 'utf8')))
      .map((entry) => entry.rel);

    expect(offenders, 'файлы с данными без общих обёрток состояний').toEqual([]);
  });
});
