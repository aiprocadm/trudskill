import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `UI-007` · одно первичное действие на экран.
 *
 * Почему реестр, а не просто счётчик. Первичная кнопка бывает нарисована в коде дважды,
 * но показана человеку один раз: шаги мастера, ветка `isLast ? … : …`, форма, которая
 * открывается вместо кнопки шапки. Статический счётчик этого не различает — и,
 * закрученный «до нуля», начал бы требовать неправильных правок.
 *
 * Поэтому правило то же, что у сторожа прав (`permission-surface.isolation.test.ts`):
 * экран либо укладывается в бюджет, либо **перечислен ниже с ответом, почему у него
 * первичных кнопок в коде больше одной**. Ответ пишется словами и проверяется человеком
 * на ревью — сторож держит границу списка, а не выносит суждение.
 *
 * Экран = верхнеуровневый компонент, рисующий `PageContainer`. Диалоги и панели сюда не
 * попадают: у всплывающего слоя своё первичное действие, это не второй primary страницы.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

/** Экран → почему первичных кнопок в коде больше одной. Пустая причина недопустима. */
const EXPLAINED: Record<string, string> = {
  'src/features/bulk-enrollments/bulk-import-screen.tsx :: BulkImportScreen':
    'мастер из трёх шагов: «Далее: проверка», «Зачислить», «Открыть группу» — на экране одновременно виден ровно один шаг',
  'src/features/commissions/commissions-screens.tsx :: CommissionsPageScreen':
    'кнопка шапки «Создать комиссию» и кнопка отправки формы взаимно исключаются: пока форма открыта, шапка первичного действия не показывает',
  'src/features/groups/groups-list-screen.tsx :: GroupsPageScreen':
    'кнопка шапки «Создать группу» и кнопка «Закрыть N групп» в панели массового закрытия: панель открывается поверх экрана и только при выделенных строках',
  'src/features/licenses/licenses-list.tsx :: LicensesView':
    'то же взаимное исключение: открытая форма забирает первичное действие себе',
  'src/features/payments/screens.tsx :: OrdersScreen':
    'то же взаимное исключение: открытая форма забирает первичное действие себе',
  'src/features/test-player/test-attempt-screen.tsx :: TestAttemptScreen':
    'ветка `isLast`: на последнем вопросе «Завершить тест», иначе «Далее» — обе кнопки в коде, на экране всегда одна'
};

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

const DECL = /^(?:export\s+)?(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/;
const PRIMARY = /ui-button--primary|ui-button-primary|variant="primary"|primaryAction[=:]/g;

/** Верхнеуровневые компоненты файла, которые рисуют страницу, с числом первичных кнопок. */
const screensOf = (file: string, source: string): { id: string; count: number }[] => {
  const lines = source.split('\n');
  const starts: [number, string][] = [];
  lines.forEach((line, index) => {
    const match = line.match(DECL);
    if (match) starts.push([index, match[1] as string]);
  });

  const out: { id: string; count: number }[] = [];
  starts.forEach(([line, name], index) => {
    const end =
      index + 1 < starts.length ? (starts[index + 1] as [number, string])[0] : lines.length;
    const chunk = lines.slice(line, end).join('\n');
    if (!chunk.includes('<PageContainer')) return;
    out.push({ id: `${file} :: ${name}`, count: (chunk.match(PRIMARY) ?? []).length });
  });
  return out;
};

describe('UI-007 · одно первичное действие на экран', () => {
  const files = [join(FRONTEND, 'src'), join(FRONTEND, 'app')].flatMap((root) => collect(root));

  const overBudget = files.flatMap((file) =>
    screensOf(relative(FRONTEND, file).split(sep).join('/'), readFileSync(file, 'utf8')).filter(
      (screen) => screen.count > 1
    )
  );

  it('сторож видит экраны приложения', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('экран либо укладывается в бюджет, либо объяснён поимённо', () => {
    const unexplained = overBudget.map((s) => s.id).filter((id) => !(id in EXPLAINED));

    expect(
      unexplained,
      `на этих экранах больше одного первичного действия и нет объяснения:\n${unexplained.join('\n')}\n` +
        'Либо сделайте второе действие вторичным, либо припишите в EXPLAINED, почему кнопки не видны одновременно.'
    ).toEqual([]);
  });

  it('в списке нет устаревших строк — объяснение живёт, пока живёт причина', () => {
    const stale = Object.keys(EXPLAINED).filter((id) => !overBudget.some((s) => s.id === id));

    expect(
      stale,
      `эти экраны больше не превышают бюджет — вычеркните их из EXPLAINED:\n${stale.join('\n')}`
    ).toEqual([]);
  });

  it('каждое объяснение — предложение, а не отписка', () => {
    for (const [id, reason] of Object.entries(EXPLAINED)) {
      expect(reason.length, `объяснение для ${id} слишком короткое`).toBeGreaterThan(30);
    }
  });
});
