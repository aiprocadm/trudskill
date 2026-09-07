import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT } from './app-root';

/**
 * У записи, с которой что-то сделали, видно КТО это сделал.
 *
 * Сервер хранит автора действия и присылает его экрану — `resolvedBy`, `decidedBy`,
 * `generatedBy`, `createdBy`. Но поле, которое пришло и которое никто не читает, — это
 * обещание без исполнителя: сведения существуют, а человек их не видит. Так и было с
 * карантином («кто отбросил упавший выпуск удостоверения») и с очередью переаттестации
 * («кто убрал слушателя, у которого истекает удостоверение») — оба вопроса выяснялись
 * только по базе, а в регулируемом центре их задают при проверке.
 *
 * Показывать сам идентификатор нельзя (правило продукта №2), поэтому имя подставляет СЕРВЕР
 * левым соединением с учётными записями — как это давно делает журнал действий. На экране
 * читается поле-компаньон `*ByName`; удалённая запись даёт пусто, и экран говорит об этом
 * прямо, а не подставляет «система».
 *
 * Инвариант: про каждое поле авторства принято решение — либо оно показано (читается само
 * или его имя), либо записано сюда с причиной.
 */

/** Поля авторства, которые сервер присылает экрану. */
const AUTHOR_FIELD = /^ {2}([a-z][A-Za-z]*By)\??:/;

/**
 * Поля авторства, которые пока не показаны, — с причиной.
 *
 * Причина обязана быть проверяемой: либо «показывать незачем, потому что …», либо ссылка на
 * запись журнала, по которой это будет сделано. «Потом» без записи не годится.
 */
const NOT_SHOWN: Record<string, string> = {
  generatedBy:
    'кто собрал выгрузку в государственный реестр — журнал 358: пять реестров рисуют свои ' +
    'таблицы отдельными блоками, и правка требует своего PR; это «кто выполнил действие», ' +
    'а не «кто принял решение», поэтому вынесено из этого класса',
  createdBy:
    'кто завёл шаблон отчёта — журнал 358 вместе с выгрузками: шаблон заводят и правят один ' +
    'раз, спор по нему не разбирают, поэтому очередь ниже'
};

const sourcesUnder = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourcesUnder(full, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

const FEATURES = join(APP_ROOT, 'src', 'features');
const PRODUCTION = [...sourcesUnder(FEATURES), ...sourcesUnder(join(APP_ROOT, 'app'))];

/** Поля авторства, объявленные в типах экранов. */
const declared = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  for (const file of PRODUCTION) {
    const source = readFileSync(file, 'utf8');
    const relativeFile = relative(APP_ROOT, file).split('\\').join('/');
    for (const [index, line] of source.split('\n').entries()) {
      const match = AUTHOR_FIELD.exec(line);
      if (!match) continue;
      const field = match[1]!;
      found.set(field, [...(found.get(field) ?? []), `${relativeFile}:${index + 1}`]);
    }
  }
  return found;
};

/** Читается ли поле (или его имя-компаньон) вне объявления типа. */
const isShown = (field: string): boolean => {
  const reads = new RegExp(`\\.${field}\\b|\\.${field}Name\\b|\\b${field}Name\\b`);
  return PRODUCTION.some((file) => {
    if (/\/types\.ts$/.test(file.split('\\').join('/'))) return false;
    return reads.test(readFileSync(file, 'utf8'));
  });
};

const fields = declared();

describe('видно, кто это сделал', () => {
  it('сторож видит поля авторства там, где они точно есть', () => {
    // Поимённо, а не счётчиком (урок §5.426): при сломанном разборе список молча опустеет.
    for (const field of ['resolvedBy', 'decidedBy', 'generatedBy']) {
      expect(fields.has(field), `поле ${field} не найдено в типах экранов`).toBe(true);
    }
  });

  it('про каждое поле авторства принято решение', () => {
    const undecided = [...fields.entries()]
      .filter(([field]) => !isShown(field) && !(field in NOT_SHOWN))
      .map(([field, places]) => `${field} — приходит с сервера и не показан: ${places[0]}`);
    expect(undecided, `полей без решения: ${undecided.length}`).toEqual([]);
  });

  it('список не протухает — записанное поле всё ещё приходит с сервера', () => {
    const gone = Object.keys(NOT_SHOWN)
      .filter((field) => !fields.has(field))
      .map((field) => `${field} — записан в стороже, но экранам его больше не присылают`);
    expect(gone).toEqual([]);
  });

  it('причина ссылается на запись журнала, а не откладывает молча', () => {
    const vague = Object.entries(NOT_SHOWN)
      .filter(([, reason]) => !/журнал \d+/.test(reason))
      .map(([field]) => field);
    expect(vague, 'отложить можно только записью в журнале расхождений').toEqual([]);
  });
});
