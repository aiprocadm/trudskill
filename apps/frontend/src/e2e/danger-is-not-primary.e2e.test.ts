import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Опасное действие — не главная кнопка экрана (ТЗ «Стабилизация, UX и развитие», 5.4 / Э4).
 *
 * **Как было.** В карточке группы самая яркая кнопка — «Закрыть группу» (оранжевая, справа
 * вверху): необратимый выпуск документов с номерами стоял `primaryAction`, а повседневная
 * работа с группой — зачисление слушателя — пряталась серой кнопкой в секции ниже. В панели
 * закрытия оранжевой была «Запустить цепочку» — самая тяжёлая операция панели: сервер сам
 * отбирает сдавших, выпускает документы и готовит строки госвыгрузки.
 *
 * **Почему сторож смотрит на ДВА признака.** Эти два нарушения не ловятся одним:
 *
 * - «Закрыть группу» опасна ПО ПОДПИСИ, а её обработчик безобиден (`setCloseOpen(true)`);
 * - «Запустить цепочку» по подписи конструктивна — «запустить» нет ни в одном словаре
 *   опасного, — но ведёт в `closeGroupRequest({ mode: 'chain' })` с `tone: 'danger'`.
 *
 * Поэтому сигнала два: **подпись** (узкий словарь однозначных корней) и **намерение**
 * (действие идёт через подтверждение с `tone: 'danger'` — машиночитаемая метка, поставленная
 * в Э3 не ради сторожа, и потому ей можно верить).
 *
 * Словарь намеренно узкий и скучный. Широкий («отмен», «заверш», «отклон») покраснел бы на
 * кнопке «Отмена» в подвале каждой панели и на мастерах — и его начали бы глушить
 * исключениями, после чего он умер бы. Спорное держится флагом `danger` и сигналом намерения.
 *
 * **Что НЕ нарушение.** Кнопка внутри `ConfirmDialog` — там опасное действие уместно, человек
 * уже осознанно его вызвал. Экран экзамена: «Завершить тест» — необратимо, но это и есть
 * конструктивная цель экрана (сдать работу), другого действия там нет; в Э3 подтверждение
 * завершения намеренно собрано БЕЗ `tone: 'danger'`, и оба сигнала честно молчат.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];
const FEATURES = fromApp('src', 'features');
const PAGE_SHELL = fromPackages('ui', 'src', 'composition', 'page-shell.tsx');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');

/**
 * Акцентная кнопка опасного действия, оставленная осознанно. Пустая причина недопустима.
 *
 * Сверяется на РАВЕНСТВО с найденным: и новое нарушение, и устаревшая запись красят сторожа.
 */
const EXPLAINED: Record<string, string> = {};

/** Корни подписей, у которых один смысл — необратимое действие. */
const DANGER_LABEL_ROOTS = [
  'закрыть групп',
  'удал',
  'архивиров',
  'в архив',
  'отозв',
  'приостанов',
  'обезлич',
  'отчисл',
  'аннулир',
  'снять с публикац',
  'сбросить',
  'отвяз',
  'прекрат',
  'заблокир',
  'разорв',
  'очистить',
  'войти от имени',
  'стереть'
];

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

const isDangerLabel = (label: string): boolean => {
  const lowered = label.toLowerCase();
  return DANGER_LABEL_ROOTS.some((root) => lowered.includes(root));
};

/**
 * Сборщики подтверждений, которые сами объявляют действие опасным (`tone: 'danger'`).
 *
 * Читаются из кода, а не перечисляются здесь: новый сборщик подхватится сам, исчезнувший
 * не оставит мёртвой строки.
 */
const dangerRequestBuilders = (): string[] => {
  const names = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.includes('.test.')) continue;
      if (!/confirm/i.test(entry)) continue;
      const source = read(full);
      if (!/tone:\s*'danger'/.test(source)) continue;
      for (const m of source.matchAll(/export const (\w+)\s*=/g)) names.add(m[1]!);
    }
  };
  walk(FEATURES);
  return [...names];
};

/** Тело объявления `const NAME = …` — до следующего объявления того же отступа. */
const declarationBody = (source: string, name: string): string => {
  const start = source.search(new RegExp(`\\bconst ${name}\\b\\s*=`));
  if (start === -1) return '';
  const indent = source.slice(0, start).split('\n').pop()?.match(/^\s*/)?.[0] ?? '';
  const rest = source.slice(start + name.length);
  const next = rest.search(new RegExp(`\\n${indent}(?:const|return|function|\\})\\b`));
  return next === -1 ? rest : rest.slice(0, next);
};

/** Имена обработчиков файла, которые ведут к подтверждению с `tone: 'danger'`. */
const dangerHandlers = (source: string, builders: string[]): Set<string> => {
  const danger = new Set<string>();
  for (const m of source.matchAll(/\bconst (\w+)\s*=/g)) {
    const name = m[1]!;
    const body = declarationBody(source, name);
    if (!/\bask\w*\(/.test(body)) continue;
    const callsBuilder = builders.some((b) => new RegExp(`\\b${b}\\(`).test(body));
    const inlineDanger = /tone:\s*'danger'/.test(body);
    if (callsBuilder || inlineDanger) danger.add(name);
  }
  return danger;
};

type AccentButton = { label: string; handler: string; line: number };

/** Индекс закрывающей скобки конструкции, начатой символом в `open`. */
const matchBrace = (code: string, open: number, chars: [string, string]): number => {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === chars[0]) depth += 1;
    if (code[i] === chars[1]) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const lineOf = (source: string, index: number): number => source.slice(0, index).split('\n').length;

/**
 * Конец открывающего тега JSX: `>` на нулевой глубине фигурных скобок.
 *
 * Наивный `indexOf('>')` обрывал тег на СТРЕЛКЕ обработчика (`onClick={() => …}`), и сигнал
 * намерения не видел вызова — подсаженная поломка «акцент вернулся на „Запустить цепочку“»
 * прошла мимо сторожа. Замер врал, а не правило; поймано мутацией, а не чтением.
 */
const tagEndOf = (source: string, from: number): number => {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return i;
  }
  return -1;
};

/**
 * Акцентные кнопки файла: `<button className="… ui-button--primary …">` и `variant="primary"`.
 *
 * Возвращает подпись (текст между тегами) и выражение обработчика — по ним и судим.
 */
const accentButtons = (source: string): AccentButton[] => {
  const out: AccentButton[] = [];
  const ACCENT = /ui-button--primary|ui-button-primary|variant="primary"/g;
  for (const hit of source.matchAll(ACCENT)) {
    const tagStart = source.lastIndexOf('<', hit.index!);
    if (tagStart === -1) continue;
    const tagEnd = tagEndOf(source, tagStart);
    if (tagEnd === -1) continue;
    const tag = source.slice(tagStart, tagEnd);
    const close = source.indexOf('<', tagEnd);
    const label = source.slice(tagEnd + 1, close === -1 ? tagEnd + 1 : close).trim();
    /*
     * Обработчиком считаем ВЕСЬ открывающий тег, а не вырезанный `onClick`: вырезать его
     * регуляркой — снова строить хрупкий замер (стрелки, вложенные скобки, второй обработчик).
     * Имена в подписи класса и в `disabled` под правило всё равно не подпадают.
     */
    out.push({ label, handler: tag, line: lineOf(source, hit.index!) });
  }
  return out;
};

/** Первичные действия шапки: `primaryAction: { label: '…', onSelect: … }`. */
const primaryActions = (source: string): AccentButton[] => {
  const out: AccentButton[] = [];
  for (const hit of source.matchAll(/primaryAction:\s*\{/g)) {
    const open = source.indexOf('{', hit.index!);
    const close = matchBrace(source, open, ['{', '}']);
    if (close === -1) continue;
    const body = source.slice(open, close + 1);
    const label =
      /label:\s*'([^']*)'/.exec(body)?.[1] ?? /label:\s*`([^`]*)`/.exec(body)?.[1] ?? '';
    out.push({ label, handler: body, line: lineOf(source, hit.index!) });
  }
  return out;
};

const violations = (): string[] => {
  const builders = dangerRequestBuilders();
  const found: string[] = [];
  for (const file of ROOTS.flatMap((root) => collect(root))) {
    const source = read(file);
    const handlers = dangerHandlers(source, builders);
    const namesDanger = (expression: string): boolean =>
      [...handlers].some((name) => new RegExp(`\\b${name}\\b`).test(expression)) ||
      builders.some((b) => new RegExp(`\\b${b}\\(`).test(expression));

    for (const button of [...accentButtons(source), ...primaryActions(source)]) {
      const byLabel = isDangerLabel(button.label);
      const byIntent = namesDanger(button.handler);
      if (!byLabel && !byIntent) continue;
      found.push(`${rel(file)} :: ${button.label || '(без подписи)'}`);
    }
  }
  return [...new Set(found)].sort();
};

describe('опасное действие — не главная кнопка экрана (ТЗ 5.4)', () => {
  it('сторож видит экраны, а не пустой список', () => {
    const files = ROOTS.flatMap((root) => collect(root));
    expect(files.length).toBeGreaterThan(150);
    expect(
      files.flatMap((f) => accentButtons(read(f))).length,
      'акцентные кнопки в приложении обязаны находиться — иначе сторож проверяет пустоту'
    ).toBeGreaterThan(20);
  });

  it('сигнал «намерение» действительно читает сборщики подтверждений', () => {
    const builders = dangerRequestBuilders();
    expect(builders, 'сборщики с tone: danger обязаны находиться').toContain('closeGroupRequest');
    expect(builders).toContain('statusChangeRequest');
    expect(
      builders,
      'завершение теста собрано БЕЗ tone: danger (Э3) — экран экзамена не нарушение'
    ).not.toContain('finishTestRequest');
  });

  it('словарь подписей узкий: спорные слова в него не попали', () => {
    for (const safe of [
      'Отмена',
      'Отменить',
      'Завершить настройку',
      'Отклонить работу',
      'Опубликовать',
      'Закрыть',
      'Открыть'
    ]) {
      expect(isDangerLabel(safe), `«${safe}» — не однозначно опасное слово`).toBe(false);
    }
    for (const bad of [
      'Закрыть группу',
      'Удалить шаблон',
      'Архивировать',
      'Отозвать лицензию',
      'Аннулировать',
      'Войти от имени'
    ]) {
      expect(isDangerLabel(bad), `«${bad}» обязано считаться опасным`).toBe(true);
    }
  });

  it('ни одна акцентная кнопка не запускает необратимое действие', () => {
    expect(
      violations(),
      'главная кнопка экрана — конструктивное действие; необратимое — вторичная кнопка или «Ещё». ' +
        'Осознанное исключение вписывается в EXPLAINED с причиной'
    ).toEqual(Object.keys(EXPLAINED).sort());
  });

  it('тип не пропускает опасное действие в главную кнопку', () => {
    const shell = read(PAGE_SHELL);
    expect(
      /export type SafePageAction = PageAction & \{ danger\?: false \}/.test(shell),
      'первичное действие обязано быть типом, который не принимает danger'
    ).toBe(true);
    expect(/primaryAction\?: SafePageAction/.test(shell)).toBe(true);
    expect(/secondaryActions\?: PageAction\[\]/.test(shell)).toBe(true);
  });

  it('опасное вторичное действие — красным и в низу меню', () => {
    const shell = read(PAGE_SHELL);
    expect(/variant=\{action\.danger \? 'danger' : 'secondary'\}/.test(shell)).toBe(true);
    expect(
      /secondaryActions\.filter\(\(a\) => !a\.danger\), \.\.\.secondaryActions\.filter\(\(a\) => a\.danger\)/.test(
        shell.replace(/\s+/g, ' ')
      ),
      'порядок пунктов меню считает компонент, а не каждый вызывающий'
    ).toBe(true);
    expect(read(fromPackages('ui', 'src', 'styles', 'foundation.ts'))).toMatch(
      /\.ui-header-menu__item--danger\s*\{[^}]*--ui-danger/
    );
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э4');
    expect(doc).toContain('SafePageAction');
  });
});
