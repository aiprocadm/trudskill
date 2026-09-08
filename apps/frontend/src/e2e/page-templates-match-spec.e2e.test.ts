import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT } from './app-root';

/**
 * `TPL-001`–`TPL-004`: экран собран по шаблону, назначенному ему в ТЗ.
 *
 * ТЗ §7 описывает четыре каркаса страниц, а таблица §8.2 раздаёт их поимённо: `/workspace` —
 * дашборд, `/learners` — реестр, `/groups/[id]` — карточка объекта, `/groups/new` — форма.
 * Каркас — это не украшение: он решает, где человек ищет первичное действие, куда смотрит за
 * ошибкой и что видит на телефоне. Пересобранный вручную экран выглядит похоже, но теряет
 * поведение, которое живёт внутри композиции пакета.
 *
 * Что уже проверялось и что нет. Реестры держит храповик `list-page-ratchet`, дашборд
 * `/workspace` — `home-screen-density`. А **карточка объекта (`TPL-002`) и форма (`TPL-004`)
 * не проверялись ничем**: `DetailLayout` не упоминался ни в одном стороже. Экран можно было
 * собрать из `SectionCard` вручную, и никто бы не заметил.
 *
 * Почему сторож читает таблицу ТЗ, а не свой список: свой пришлось бы держать в согласии с
 * ТЗ руками — ровно та работа, которую сторож и снимает. Появится в таблице десятая строка
 * или новый шаблон — сторож потребует решения, а не промолчит.
 *
 * Колонку «Файл реализации» сторож НЕ читает намеренно: это снимок «до редизайна» (там
 * `documents/page.tsx` на 766 строк, которого больше нет), а не обещание про сегодняшний код.
 * Проверяется маршрут → шаблон; где живёт экран, сторож находит сам, идя по импортам.
 */

const SPEC = join(APP_ROOT, '..', '..', 'docs', 'TZ_UI_REDESIGN_TRUDSKILL.md');
const APP_DIR = join(APP_ROOT, 'app');

/**
 * Компонент, по которому видно, что каркас взят из пакета, а не собран заново.
 *
 * `TPL-004` в ТЗ назван `FormLayout` («сейчас 0 использований»); в коде он появился под
 * именем `Form` (класс `ui-form`, ширина `--ui-form-max: 720px`). Расхождение имён записано
 * в журнал; сторож сверяет с тем, что существует.
 *
 * У `TPL-004` два признака, потому что и сам шаблон двойной — «Форма **и мастер**» (§7.4):
 * короткая форма собирается `Form`, многошаговый ввод — `WizardSteps`. Зачисление списком —
 * второй случай: там нечего отправлять одной кнопкой, там три шага.
 */
const TEMPLATE_MARKERS: Record<string, string[]> = {
  'TPL-001': ['ListPage', 'DataTable'],
  'TPL-002': ['DetailLayout'],
  'TPL-003': ['AttentionWidget'],
  'TPL-004': ['Form', 'WizardSteps']
};

type SpecRow = { route: string; template: string };

/** Таблица §8.2 ТЗ: маршрут волны 1 и назначенный ему шаблон. */
const specRows = (): SpecRow[] => {
  const text = readFileSync(SPEC, 'utf8');
  const from = text.indexOf('### 8.2.');
  const to = text.indexOf('### 8.3.');
  if (from === -1 || to === -1) throw new Error('раздел 8.2 в ТЗ не найден');
  const rows: SpecRow[] = [];
  for (const line of text.slice(from, to).split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    // Маршрут | Файл реализации | Шаблон | Что меняется
    if (cells.length < 5) continue;
    const route = (cells[1] ?? '').replace(/`/g, '').trim();
    const template = (cells[3] ?? '').replace(/`/g, '').trim();
    if (!route.startsWith('/') || !/^TPL-\d{3}$/.test(template)) continue;
    rows.push({ route, template });
  }
  return rows;
};

/**
 * Исходник без комментариев и строковых литералов.
 *
 * Без этого сторож нашёл бы `DetailLayout` в объяснении над экраном («переводим на
 * DetailLayout») и зачёл бы намерение за сделанное.
 */
const scan = (source: string, dropStrings: boolean): string => {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === '//') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    const char = source[index] ?? '';
    if (char === '"' || char === "'" || char === '`') {
      const start = index;
      index += 1;
      while (index < source.length && source[index] !== char) {
        index += source[index] === '\\' ? 2 : 1;
      }
      index += 1;
      out += dropStrings ? ' ' : source.slice(start, index);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
};

/** Исходник без комментариев, но с путями импорта — по нему ищутся импорты. */
const withoutComments = (source: string): string => scan(source, false);

/** Исходник, в котором остался только код — по нему ищутся компоненты шаблона. */
const codeOnly = (source: string): string => scan(source, true);

const resolveImport = (fromFile: string, specifier: string): string | null => {
  const base = join(dirname(fromFile), specifier);
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts')
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

/**
 * Файлы экрана: страница маршрута и то, во что она разворачивается, на два шага вглубь.
 *
 * Два шага — не произвольное число: `page.tsx` ≤20 строк по §8.2 отдаёт работу экрану
 * (шаг 1), а крупный экран раздаёт её секциям (шаг 2, так устроены «Документы»). Глубже
 * идти нельзя: там начинаются общие хуки, и любой шаблон «нашёлся» бы у любого экрана.
 */
const screenFiles = (route: string): string[] => {
  const entry = join(APP_DIR, ...route.replace(/^\//, '').split('/'), 'page.tsx');
  if (!existsSync(entry)) return [];
  const seen = new Set<string>([entry]);
  let frontier = [entry];
  for (let depth = 0; depth < 2; depth += 1) {
    const next: string[] = [];
    for (const file of frontier) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
        const resolved = resolveImport(file, match[1] ?? '');
        if (resolved === null || seen.has(resolved)) continue;
        seen.add(resolved);
        next.push(resolved);
      }
    }
    frontier = next;
  }
  return [...seen];
};

const rows = specRows();

/** Экраны с мастером — их шаги считает бюджетная проверка ниже. */
const wizardFiles = (): string[] => {
  const found = new Set<string>();
  for (const row of rows) {
    for (const file of screenFiles(row.route)) {
      if (/\bWizardSteps\b/.test(codeOnly(readFileSync(file, 'utf8')))) found.add(file);
    }
  }
  return [...found];
};

describe('TPL-001…004 · экран собран по шаблону из ТЗ', () => {
  it('таблица §8.2 прочитана, а не пропущена молча', () => {
    expect(rows.map((row) => row.route)).toEqual([
      '/workspace',
      '/learners',
      '/learners/[id]',
      '/groups',
      '/groups/[id]',
      '/groups/new',
      '/documents',
      '/admin/issuance-journal',
      '/admin/bulk-enrollments'
    ]);
  });

  it('у каждого шаблона из таблицы названо, по чему его узнавать', () => {
    const unknown = rows.filter((row) => TEMPLATE_MARKERS[row.template] === undefined);
    expect(
      unknown.map((row) => `${row.route} → ${row.template}`),
      'новый шаблон в таблице ТЗ: добавьте его компоненты в TEMPLATE_MARKERS, иначе строка не проверяется'
    ).toEqual([]);
  });

  it('страница каждого маршрута существует', () => {
    const missing = rows.filter((row) => screenFiles(row.route).length === 0);
    expect(missing.map((row) => row.route)).toEqual([]);
  });

  it('разбор импортов работает: экран — это не один page.tsx', () => {
    /*
     * Страховка от тихого «всё зелено»: сломайся разбор импортов, сторож видел бы только
     * тонкую страницу-обёртку и не нашёл бы ни одного шаблона — но узнать причину было бы
     * неоткуда. Здесь она названа прямо.
     */
    const flat = rows.filter((row) => screenFiles(row.route).length < 2);
    expect(flat.map((row) => row.route)).toEqual([]);
  });

  it('шагов у мастера не больше четырёх (§7.4)', () => {
    /*
     * Бюджет из ТЗ, а не вкусовщина: шаги мастера человек держит в голове целиком — на
     * телефоне их вообще показывают строкой «Шаг 2 из 3». Пятый шаг обычно значит, что в
     * мастер въехала работа, которой место на отдельном экране.
     */
    const over: string[] = [];
    for (const file of wizardFiles()) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      for (const usage of code.matchAll(/steps=\{(\w+)\}/g)) {
        const name = usage[1] ?? '';
        const declared = new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(code);
        const steps = [...(declared?.[1] ?? '').matchAll(/\bid:/g)].length;
        if (steps === 0 || steps > 4) {
          over.push(`${relative(APP_ROOT, file)}: ${name} — шагов ${steps}`);
        }
      }
    }
    expect(over).toEqual([]);
  });

  it('каждый экран использует компонент своего шаблона', () => {
    const broken: string[] = [];
    for (const row of rows) {
      const markers = TEMPLATE_MARKERS[row.template] ?? [];
      const found = screenFiles(row.route).some((file) => {
        const code = codeOnly(readFileSync(file, 'utf8'));
        /*
         * Ищется именно отрисовка `<Компонент`, а не упоминание имени. Проверка «слово
         * встречается в файле» зачитывала бы за применённый шаблон строку импорта — а
         * `import { DetailLayout as Grid }` с самодельной разметкой её проходит.
         */
        return markers.some((marker) => new RegExp(`<${marker}\\b`).test(code));
      });
      if (!found)
        broken.push(`${row.route} → ${row.template}: нет ни одного из ${markers.join(', ')}`);
    }
    expect(broken).toEqual([]);
  });
});
