import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Сторож программы 287 (журнал расхождений): тесты бэкенда обязаны проходить проверку типов.
 *
 * Почему он есть. `apps/backend/tsconfig.json` исключает `src/**\/*.test.ts` — так и должно
 * быть, это конфигурация СБОРКИ, тестам в `dist` не место. Но из-за этого проверка типов
 * не видела тесты вовсе, и промах «конструктор класса вырос на аргумент, а вызов в тесте
 * не обновлён» ловился только прогоном. Если промах уезжал в `setImmediate`, прогон краснел
 * `Unhandled Errors`, НЕ называя виновный тест. На этом обжигались дважды.
 *
 * Разбор 2026-08-28 нашёл 320 таких ошибок в 92 файлах, и среди них — десять мест, где
 * сервис собирали без обязательной зависимости, выпуск документа звали без ключа
 * идемпотентности, а тесты подавали значения, которых в домене нет.
 *
 * Сторож связывает три файла, которые иначе расходятся молча: отдельная конфигурация
 * `tsconfig.test.json` существует, включает тесты и ЗАПУСКАЕТСЯ гейтом `typecheck`.
 */

const backendRoot = process.cwd().endsWith(join('apps', 'backend'))
  ? process.cwd()
  : join(process.cwd(), 'apps', 'backend');

const readJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(backendRoot, name), 'utf8')) as Record<string, unknown>;

describe('тесты бэкенда под проверкой типов (журнал 287)', () => {
  it('конфигурация проверки тестов существует и наследует строгость сборки', () => {
    const testConfig = readJson('tsconfig.test.json');

    expect(testConfig.extends, 'tsconfig.test.json обязан наследовать tsconfig.json').toBe(
      './tsconfig.json'
    );

    const options = (testConfig.compilerOptions ?? {}) as Record<string, unknown>;
    expect(options.noEmit, 'проверка тестов ничего не собирает').toBe(true);

    // Ослабления строгости быть не должно: с ними проверка перестаёт что-либо доказывать.
    for (const forbidden of [
      'strict',
      'noImplicitAny',
      'strictNullChecks',
      'noUncheckedIndexedAccess'
    ]) {
      expect(
        options[forbidden],
        `${forbidden} нельзя переопределять в tsconfig.test.json — строгость должна остаться той же`
      ).toBeUndefined();
    }
  });

  it('конфигурация проверки НЕ исключает тесты', () => {
    const testConfig = readJson('tsconfig.test.json');
    const exclude = (testConfig.exclude ?? []) as string[];

    for (const pattern of exclude) {
      expect(
        pattern.includes('.test.'),
        `«${pattern}» снова прячет тесты от проверки типов — ради этого и заведён сторож`
      ).toBe(false);
    }
  });

  it('гейт typecheck действительно её запускает', () => {
    const pkg = readJson('package.json');
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;

    expect(
      scripts.typecheck ?? '',
      'скрипт typecheck обязан гонять tsconfig.test.json — иначе конфигурация есть, а гейта нет'
    ).toContain('tsconfig.test.json');
  });

  it('тесты в репозитории есть — проверять действительно что', () => {
    // Пустой набор сделал бы все проверки выше бессмысленно зелёными.
    const countTests = (dir: string): number => {
      let total = 0;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) total += countTests(full);
        else if (entry.name.endsWith('.test.ts')) total += 1;
      }
      return total;
    };

    expect(countTests(join(backendRoot, 'src'))).toBeGreaterThan(100);
  });
});

/**
 * То же требование, но ко ВСЕМУ репозиторию (журнал 296).
 *
 * Разбор 2026-08-28 показал: тесты прятались от проверки типов не только у бэкенда —
 * так же были устроены `@trudskill/ui` (239 ошибок), `docx-render`, `worker`, `realtime`,
 * `api-contracts`, `shared-types`, `test-utils`. Правило простое: если конфигурация СБОРКИ
 * пакета исключает тесты (и правильно делает — в `dist` им не место), у пакета обязана быть
 * отдельная конфигурация проверки, и она обязана запускаться его гейтом `typecheck`.
 */
describe('тесты под проверкой типов — по всему репозиторию (журнал 296)', () => {
  const repoRoot = join(backendRoot, '..', '..');

  /** Конфигурации TypeScript допускают комментарии — обычный JSON.parse на них спотыкается. */
  const readJsonc = (file: string): Record<string, unknown> =>
    JSON.parse(
      readFileSync(file, 'utf8')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
    ) as Record<string, unknown>;

  const packagesWithTests = (): string[] => {
    const found: string[] = [];
    for (const group of ['apps', 'packages']) {
      const groupDir = join(repoRoot, group);
      for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = join(groupDir, entry.name);
        const hasTests = (from: string): boolean => {
          for (const item of readdirSync(from, { withFileTypes: true })) {
            if (item.name === 'node_modules' || item.name === 'dist' || item.name === '.next') {
              continue;
            }
            const full = join(from, item.name);
            if (item.isDirectory()) {
              if (hasTests(full)) return true;
            } else if (/\.test\.tsx?$/.test(item.name)) {
              return true;
            }
          }
          return false;
        };
        try {
          readFileSync(join(dir, 'tsconfig.json'), 'utf8');
        } catch {
          continue;
        }
        if (hasTests(dir)) found.push(dir);
      }
    }
    return found;
  };

  it('каждый пакет, прячущий тесты от сборки, проверяет их отдельной конфигурацией', () => {
    const offenders: string[] = [];

    for (const dir of packagesWithTests()) {
      const exclude = (readJsonc(join(dir, 'tsconfig.json')).exclude ?? []) as string[];
      const hidesTests = exclude.some((pattern) => pattern.includes('.test.'));
      if (!hidesTests) continue; // тесты и так в общей проверке (так устроен фронтенд)

      const name = dir.slice(repoRoot.length + 1);
      let testConfigExists = true;
      try {
        readFileSync(join(dir, 'tsconfig.test.json'), 'utf8');
      } catch {
        testConfigExists = false;
      }
      if (!testConfigExists) {
        offenders.push(`${name}: нет tsconfig.test.json`);
        continue;
      }

      const scripts = (readJsonc(join(dir, 'package.json')).scripts ?? {}) as Record<
        string,
        string
      >;
      if (!(scripts.typecheck ?? '').includes('tsconfig.test.json')) {
        offenders.push(`${name}: скрипт typecheck не гоняет tsconfig.test.json`);
      }
    }

    expect(
      offenders,
      `Тесты этих пакетов снова невидимы для проверки типов:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('пакетов с тестами найдено достаточно — обход не молчит вхолостую', () => {
    // Инвентарь, который ничего не нашёл, делает проверку выше бессмысленно зелёной.
    expect(packagesWithTests().length).toBeGreaterThanOrEqual(6);
  });
});
