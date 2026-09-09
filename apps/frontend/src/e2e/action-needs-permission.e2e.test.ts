import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';
import { BACKEND_SRC } from './backend-source';

/**
 * Действие не показывается тому, кому оно запрещено.
 *
 * Что было. На экран пускают по праву ЧТЕНИЯ, а кнопки на нём меняют данные и требуют права
 * ЗАПИСИ. Проверяющий открывал книгу выдачи и видел «Аннулировать»; администратор ролей
 * заходил в настройки и видел «Загрузить бланк»; в карточке группы у всех светилось
 * «Закрыть группу». Нажатие заканчивалось отказом сервера — человек делал вывод, что
 * сломалось, а не что ему это не положено.
 *
 * Правило: если действие требует права, экран обязан о нём спросить. Меню так и устроено —
 * пункт без права не показывается (`getVisibleNavigation`); кнопки должны вести себя так же.
 *
 * Сторож строит соответствие сам: читает права из декораторов бэкенда и адреса из функций
 * фронта. Свой список пришлось бы держать в согласии с обоими — то есть ровно та работа,
 * которую сторож и снимает.
 */

const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const walk = (dir: string, test: (name: string) => boolean, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, test, acc);
    else if (test(entry)) acc.push(full);
  }
  return acc;
};

const normalizePath = (path: string): string => {
  const clean = path.split('?')[0]!.replace(/\/$/, '');
  return clean.replace(/\$\{[^}]+\}/g, ':x').replace(/\/:[^/]+/g, '/:x') || '/';
};

/** Изменяющая ручка бэкенда → права. Право объявляется ПОСЛЕ маршрута, а не до. */
const endpointPermissions = (): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const file of walk(
    BACKEND_SRC,
    (n) => n.endsWith('.controller.ts') && !n.includes('.test.')
  )) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const route = /@(Post|Put|Patch|Delete)\('([^']*)'\)/.exec(line);
      if (!route) return;
      for (let j = index + 1; j < Math.min(index + 8, lines.length); j += 1) {
        const next = lines[j] ?? '';
        if (/^\s*(async\s+)?\w+\s*\(/.test(next) && !next.includes('@')) break;
        const perms = /@RequirePermissions\(([^)]*)\)/.exec(next);
        if (perms) {
          const list = [...perms[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
          map.set(
            `${route[1]!.toUpperCase()} ${normalizePath('/' + route[2]!.replace(/^\//, ''))}`,
            list
          );
          break;
        }
      }
    });
  }
  return map;
};

/** Функция фронта, меняющая данные, → права её ручки. */
const mutatingFunctions = (endpoints: Map<string, string[]>) => {
  const found = new Map<string, { perms: string[]; module: string }>();
  for (const file of walk(fromApp('src'), (n) => /\.tsx?$/.test(n) && !n.includes('.test.'))) {
    const code = codeOnly(readFileSync(file, 'utf8'));
    const calls = code.matchAll(
      /(\w+)\s*[:=]\s*(?:async\s*)?\([^)]*\)[^\n]*=>[\s\S]{0,120}?apiRequest<[^>]*>\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*\{([\s\S]{0,120}?)\}/g
    );
    for (const call of calls) {
      const method = /method:\s*'(\w+)'/.exec(call[3] ?? '');
      if (!method) continue;
      const perms = endpoints.get(`${method[1]!.toUpperCase()} ${normalizePath(call[2] ?? '')}`);
      if (perms?.length) found.set(call[1]!, { perms, module: file });
    }
  }
  return found;
};

/**
 * Места, где проверка права стоит НЕ здесь: окно или раздел открывается кнопкой с другого
 * экрана, и спрашивать право надо ТАМ — внутри окна поздно, человек его уже открыл.
 *
 * У каждой записи указано, ГДЕ стоит проверка и какое право ищется. Это не отговорка, а
 * проверяемое утверждение: сторож идёт по указанному файлу и требует найти в нём право.
 * Иначе список превратился бы в место, куда сваливают всё, что не хочется чинить, — и
 * снятая проверка на открывающем экране прошла бы незамеченной (так и случилось при первой
 * редакции этого сторожа: мутация «убрать проверку в книге выдачи» его не покрасила).
 */
const CHECKED_ELSEWHERE: Record<string, { why: string; where: string[]; perms: string[] }> = {
  'src/features/close-group/screens.tsx': {
    why: 'раздел открывается кнопками «Закрыть группу» в карточке группы и «Открыть закрытие группы» в книге выдачи',
    where: [
      'src/features/groups/group-details-screen.tsx',
      'src/features/issuance-journal/issuance-journal.tsx'
    ],
    perms: ['documents.generate']
  },
  'src/features/documents/template-setup-section.tsx': {
    why: 'раздел открывается действием строки «Настроить бланк» в реестре шаблонов',
    where: ['src/features/documents/templates-section.tsx'],
    perms: ['documents.write']
  },
  'src/features/group-orders/issue-order-modal.tsx': {
    why: 'окно открывается действием «Сгенерировать приказ» в карточке группы',
    where: ['src/features/groups/group-details-screen.tsx'],
    perms: ['documents.write']
  },
  'src/features/issuance-journal/revoke-reissue-modal.tsx': {
    why: 'окно открывается действиями строки «Аннулировать» и «Перевыпустить» в книге выдачи',
    where: ['src/features/issuance-journal/issuance-journal.tsx'],
    perms: ['documents.write']
  },
  'src/features/proctoring/screens.tsx': {
    why: 'запись прокторинга начинается САМА при старте экзамена — это не кнопка, а часть сценария, в который человек уже допущен',
    where: [],
    perms: []
  },
  'src/features/scorm/scorm-player.tsx': {
    why: 'проигрыватель отмечает прогресс сам, пока человек проходит материал: спрашивать право на действие, которого он не совершал, незачем',
    where: [],
    perms: []
  }
};

const endpoints = endpointPermissions();
const functions = mutatingFunctions(endpoints);
const screens = [
  ...walk(fromApp('src'), (n) => n.endsWith('.tsx') && !n.includes('.test.')),
  ...walk(fromApp('app'), (n) => n.endsWith('.tsx') && !n.includes('.test.'))
];

const unguarded = (() => {
  const out = new Set<string>();
  for (const file of screens) {
    const code = codeOnly(readFileSync(file, 'utf8'));
    for (const call of code.matchAll(/\b(\w*[Aa]pi)\.(\w+)\s*\(/g)) {
      const known = functions.get(call[2] ?? '');
      if (!known) continue;
      /* Объект вызова должен принадлежать тому же модулю — иначе совпадёт любое имя. */
      const moduleName = known.module.split('/').slice(-2, -1)[0]?.replace(/-/g, '') ?? '';
      if (!moduleName.includes((call[1] ?? '').toLowerCase().replace('api', ''))) continue;
      if (known.perms.some((p) => code.includes(p))) continue;
      out.add(relative(APP_ROOT, file));
    }
  }
  return [...out].sort();
})();

describe('действие не показывается тому, кому оно запрещено', () => {
  it('соответствие «ручка → право» построено, а не пустое', () => {
    /* Сломайся разбор — всё стало бы «чисто», ничего не проверив. */
    expect(endpoints.size).toBeGreaterThan(150);
    expect(functions.size).toBeGreaterThan(50);
    expect(screens.length).toBeGreaterThan(100);
  });

  it('у каждого действия на экране спрошено нужное право', () => {
    const missing = unguarded.filter((file) => !(file in CHECKED_ELSEWHERE));
    expect(
      missing,
      'человек увидит кнопку, нажмёт и получит отказ сервера — и решит, что сломалось, а не что ему это не положено'
    ).toEqual([]);
  });

  it('список исключений не протухает — каждое всё ещё нужно', () => {
    const stale = Object.keys(CHECKED_ELSEWHERE).filter((file) => !unguarded.includes(file));
    expect(stale, 'исключение больше никого не описывает — уберите строку').toEqual([]);
  });

  it('проверка ДЕЙСТВИТЕЛЬНО стоит там, куда указывает исключение', () => {
    /*
     * Без этого исключение — просто обещание. Снимут проверку на открывающем экране, и
     * человек снова увидит кнопку, которой у него нет права воспользоваться.
     */
    const broken: string[] = [];
    for (const [file, entry] of Object.entries(CHECKED_ELSEWHERE)) {
      for (const opener of entry.where) {
        const code = codeOnly(readFileSync(join(APP_ROOT, opener), 'utf8'));
        const missing = entry.perms.filter((perm) => !code.includes(perm));
        if (missing.length > 0)
          broken.push(`${opener}: нет проверки ${missing.join(', ')} (для ${file})`);
      }
    }
    expect(broken).toEqual([]);
  });
});
