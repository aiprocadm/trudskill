import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `IA-019` · сторожа, которых редизайн обязан был обновить.
 *
 * ТЗ §4.8 перечисляет восемь тестов и для каждого — инвариант, который меняется вместе с
 * новой информационной архитектурой. Список был обычной таблицей в документе: её
 * прочитали, тесты по ходу фаз поправили — и проверить это стало нечем, кроме памяти.
 *
 * Здесь таблица становится живой. Сторож держит два свойства:
 *
 * 1. **Каждый тест из списка существует** — переименовали файл, а таблицу не поправили,
 *    и требование тихо перестало иметь смысл.
 * 2. **В нём есть признак НОВОГО инварианта** — не «тест зелёный», а «тест проверяет то,
 *    что должен после редизайна». Зелёный тест со старым ожиданием — худший вид сторожа:
 *    он даёт уверенность, ничего не проверяя.
 *
 * Признаки намеренно грубые (подстрока). Тонкая проверка смысла — дело ревью; сторож
 * ловит случай «файл переписали и инвариант потеряли».
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

interface GuardExpectation {
  /** Путь от `apps/frontend`. */
  file: string;
  /** Что должно быть внутри — признак нового инварианта. */
  contains: string[];
  /** Инвариант словами: читается в сообщении об ошибке. */
  invariant: string;
}

const IA_019_GUARDS: GuardExpectation[] = [
  {
    file: 'src/e2e/navigation-shell.e2e.test.ts',
    contains: ['getNavigationView', 'main.length'],
    invariant:
      'меню роли считается на настоящей функции и не длиннее семи пунктов, остальное — «Ещё»'
  },
  {
    file: 'src/e2e/ia-architecture.e2e.test.ts',
    contains: ['IA-017', 'redirect'],
    invariant: 'маршрут-перенаправление не становится сиротой и не заводит второй пункт меню'
  },
  {
    file: 'src/e2e/unified-states.e2e.test.ts',
    contains: ['APP_DIR', 'collectScreenFiles'],
    invariant: 'охват расширен на app/** и на все .tsx в features/, а не «файлы с удачным именем»'
  },
  {
    file: 'src/e2e/lms-role-flows.e2e.test.ts',
    contains: ['/workspace'],
    invariant: 'пути ролей ведут в новые разделы после смены primaryNav'
  },
  {
    file: 'src/e2e/role-access.e2e.test.ts',
    contains: ['evaluateRouteAccess'],
    invariant: 'доступ к маршруту считается общей функцией, а не переписан в тесте'
  },
  {
    file: 'src/e2e/auth-routing.e2e.test.ts',
    contains: ['redirect-login'],
    invariant: 'неавторизованного уводит на вход, а не на «доступ запрещён»'
  },
  {
    file: 'src/features/navigation/nav-groups.test.ts',
    contains: ['10 блоков'],
    invariant: 'блоков ИА десять — это решение владельца №1, сокращали видимое меню, а не блоки'
  },
  {
    file: 'src/features/navigation/role-blueprints.test.ts',
    contains: ['primaryNav'],
    invariant: 'состав короткого меню роли зафиксирован тестом'
  },
  {
    file: 'src/e2e/session-bootstrap-reload.e2e.test.ts',
    contains: ['trudskill.'],
    invariant: 'ключи хранения — с новым префиксом бренда (ребрендинг, категория B)'
  }
];

describe('IA-019 · сторожа обновлены вместе с архитектурой', () => {
  it('каждый тест из таблицы ТЗ §4.8 существует', () => {
    const gone = IA_019_GUARDS.map((guard) => guard.file).filter(
      (file) => !existsSync(join(FRONTEND, file))
    );

    expect(
      gone,
      `тест из списка IA-019 переехал или переименован:\n${gone.join('\n')}\n` +
        'Поправьте список — иначе требование перестаёт что-либо значить.'
    ).toEqual([]);
  });

  it('в каждом тесте есть признак нового инварианта, а не только зелёный цвет', () => {
    const stale = IA_019_GUARDS.flatMap((guard) => {
      const full = join(FRONTEND, guard.file);
      if (!existsSync(full)) return [];
      const source = readFileSync(full, 'utf8');
      const missing = guard.contains.filter((needle) => !source.includes(needle));
      return missing.length
        ? [`${guard.file}: ${guard.invariant} (нет ${missing.join(', ')})`]
        : [];
    });

    expect(stale, `эти сторожа потеряли инвариант новой архитектуры:\n${stale.join('\n')}`).toEqual(
      []
    );
  });

  it('старый префикс ключей хранения остался только там, где читается наследие', () => {
    // `cdoprof.` допустим ровно в одном месте — где проверяется переезд со старого ключа
    // на новый (BR-020, двойное чтение). Везде ещё — забытый ребрендинг.
    const legacyUsers = ['src/lib/auth/session-store.ts', 'src/lib/auth/session-store.test.ts'];

    const others = IA_019_GUARDS.map((guard) => guard.file)
      .filter((file) => !legacyUsers.includes(file))
      .filter((file) => {
        const full = join(FRONTEND, file);
        return existsSync(full) && readFileSync(full, 'utf8').includes('cdoprof.');
      });

    expect(others, `старый префикс бренда в сторожах:\n${others.join('\n')}`).toEqual([]);
  });
});
