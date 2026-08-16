import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * TPL-006 / CMP-014 / TXT-005: пустой экран объясняет, что это за раздел, зачем он нужен
 * и что сделать первым. Одного сообщения «Записей нет» мало — человек видит пустоту и так.
 *
 * Сверка перед срезом 21 показала масштаб: 59 пустых состояний из 102 не объясняли ничего.
 * Компонент `EmptyState` умеет `hint` и `action` с самого начала — просто их не передавали.
 *
 * Сторож устроен как очередь, а не как разрешение: он падает на НОВОМ пустом состоянии без
 * пояснения и требует, чтобы каждая известная запись называла волну §8.1, в которую попадает.
 * Тот же приём, что у сторожей «полей идентификатора» и «единых состояний».
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];
const EMPTY_TAG = /<(?:SectionEmpty|EmptyState)\b(?:[^>]|\n)*?\/>/g;
/*
 * Второй способ задать пустое состояние — свойствами композиции (`ListPage`, `AsyncSection`,
 * `DataTable`). Сторож среза 21 видел только тег и пропускал этот путь: экран, переведённый
 * на `ListPage` без пояснения, проходил молча. Нашлось при переводе очередей проверки
 * в срезе 23 — три места на оперативной панели.
 */
const EMPTY_PROP = /emptyMessage=(?:"[^"]*"|\{[^}]*\})/g;
/** Пояснение ищется в окрестности вызова: свойства одного элемента стоят рядом. */
const PROP_WINDOW = 600;

/**
 * Известные места на момент среза 21. Все — кабинеты слушателя и преподавателя-методиста:
 * их разбор идёт волной 6 вместе с расщеплением монолита `features/mvp/screens.tsx` (§8.3
 * порядок 10). Трогать их сейчас — значит переделывать экран дважды.
 */
const KNOWN: Record<string, string> = {
  'src/features/methodist-home/methodist-home-screen.tsx':
    'волна 6: рабочий стол методиста — восемь блоков сроков, проверок и программ',
  'src/features/test-player/test-result-screen.tsx': 'волна 6: прохождение теста — итог попытки',
  'src/features/test-player/tests-list-screen.tsx': 'волна 6: прохождение теста — список доступных',
  'src/features/learner-home/my-courses-list.tsx': 'волна 6: кабинет слушателя — мои курсы',
  'src/features/learner-pdf-card/learner-pdf-card-sections.tsx':
    'волна 6: карточка слушателя — выданные документы',
  'src/features/mvp/screens.tsx': 'волна 6: остаток монолита — выпуск документа слушателю',
  /*
   * Сама обёртка состояний: она и есть то место, куда `hint` передаётся. Ветка без `hint`
   * существует из-за exactOptionalPropertyTypes — передать `hint={undefined}` нельзя.
   */
  'src/components/state-wrappers.tsx': 'не экран: определение обёртки SectionEmpty'
};

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

const files = [...ROOTS, fromApp('src', 'components')].flatMap((root) => collect(root));

const scan = () => {
  const silent: string[] = [];
  let explained = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const shortPath = relative(APP_ROOT, file).replace(/\\/g, '/');

    for (const match of source.match(EMPTY_TAG) ?? []) {
      if (match.includes('hint') || match.includes('action')) {
        explained += 1;
        continue;
      }
      silent.push(shortPath);
    }

    for (const match of source.matchAll(EMPTY_PROP)) {
      const around = source.slice(
        Math.max(0, match.index - PROP_WINDOW),
        match.index + match[0].length + PROP_WINDOW
      );
      if (around.includes('emptyHint') || around.includes('emptyAction')) {
        explained += 1;
        continue;
      }
      silent.push(shortPath);
    }
  }
  return { silent: [...new Set(silent)].sort(), explained };
};

describe('пустой экран объясняет себя (очередь редизайна)', () => {
  const { silent, explained } = scan();

  it('новых пустых экранов без пояснения не появилось', () => {
    const unexpected = silent.filter((file) => !(file in KNOWN));
    expect(
      unexpected,
      'пустое состояние молчит — добавьте hint (что это за раздел) и, если есть, action (что сделать первым)'
    ).toEqual([]);
  });

  it('очередь не содержит уже исправленных мест — иначе список врёт', () => {
    const fixed = Object.keys(KNOWN).filter((file) => !silent.includes(file));
    expect(fixed, 'место исправлено — уберите его из списка сторожа').toEqual([]);
  });

  it('у каждого места в очереди указана волна или причина исключения', () => {
    const withoutReason = Object.entries(KNOWN)
      .filter(([, note]) => !note.includes('волна') && !note.startsWith('не экран'))
      .map(([file]) => file);
    expect(withoutReason).toEqual([]);
  });

  /*
   * Без этой проверки сторож стал бы зелёным, если пустые состояния просто исчезнут из кода:
   * «нарушителей нет» и «правила никто не соблюдает» выглядели бы одинаково.
   */
  it('пояснения действительно расставлены по приложению, а не пропали вместе с экранами', () => {
    expect(explained).toBeGreaterThan(60);
  });
});
