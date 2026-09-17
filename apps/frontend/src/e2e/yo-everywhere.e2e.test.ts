import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Правило «везде с ё» (ТЗ «Стабилизация, UX и развитие», 4.3 / Я3).
 *
 * **Как было.** «Отчеты» в меню, «Отчёты и выгрузки» в блоке, «Конструктор отчётов» в пункте —
 * буква «ё» ставилась через раз. ТЗ: «Принять правило «везде с ё» и прогнать по всем текстам,
 * включая письма и экспорт».
 *
 * **Что закреплено.** Слова, которые в русском ВСЕГДА пишутся с «ё», не встречаются через «е» в
 * текстах для человека: строки и разметка фронта, строки бэкенда (сообщения, письма, заголовки
 * выгрузок), воркера и realtime, посевы миграций. Комментарии сняты — правило про текст, который
 * читает человек, а не программист.
 *
 * Словарь — только безопасные формы. «Черновик», «выполнен», «легко», «счета», «ожидает»,
 * «завершена/завершено» пишутся через «е», и правило их не трогает: у причастий «ё» только в
 * мужском роде и полной форме («завершён», «завершённый»), поэтому после основы допускается
 * только конец слова или «н».
 */

const FRONT_ROOTS = [
  fromApp('src', 'features'),
  fromApp('src', 'widgets'),
  fromApp('src', 'components'),
  fromApp('src', 'lib'),
  fromApp('app'),
  fromPackages('ui', 'src')
];
const BACK_ROOTS = [
  fromApp('..', 'backend', 'src'),
  fromApp('..', 'worker', 'src'),
  fromApp('..', 'realtime', 'src')
];
const MIGRATIONS = fromApp('..', 'backend', 'migrations');

const NOT_CYR = '(?<![а-яё])';
const END = '(?![а-яё])';
/* Причастие: «ё» в мужском роде и полной форме — после основы конец слова или «н». */
const PARTICIPLE = '(?=н|(?![а-яё]))';

const RULES: Array<{ wrong: RegExp; right: string }> = [
  { wrong: new RegExp(`${NOT_CYR}еще${END}`), right: 'ещё' },
  { wrong: new RegExp(`${NOT_CYR}ее${END}`), right: 'её' },
  { wrong: new RegExp(`${NOT_CYR}нее${END}`), right: 'неё' },
  { wrong: /отчет/, right: 'отчёт' },
  { wrong: /зачет/, right: 'зачёт' },
  { wrong: new RegExp(`${NOT_CYR}учет`), right: 'учёт' },
  { wrong: /расчет/, right: 'расчёт' },
  { wrong: /пересчет/, right: 'пересчёт' },
  { wrong: /подсчет/, right: 'подсчёт' },
  { wrong: new RegExp(`${NOT_CYR}счет${END}`), right: 'счёт' },
  { wrong: new RegExp(`${NOT_CYR}счетчик`), right: 'счётчик' },
  { wrong: new RegExp(`${NOT_CYR}идет${END}`), right: 'идёт' },
  { wrong: new RegExp(`${NOT_CYR}(?!вы)[а-яё]*йдет${END}`), right: '…йдёт' },
  { wrong: new RegExp(`${NOT_CYR}ведет${END}`), right: 'ведёт' },
  { wrong: new RegExp(`${NOT_CYR}несет${END}`), right: 'несёт' },
  { wrong: new RegExp(`${NOT_CYR}вернет(ся)?${END}`), right: 'вернёт(ся)' },
  { wrong: new RegExp(`${NOT_CYR}займет${END}`), right: 'займёт' },
  { wrong: new RegExp(`${NOT_CYR}начнет(ся)?${END}`), right: 'начнёт(ся)' },
  { wrong: new RegExp(`${NOT_CYR}придется${END}`), right: 'придётся' },
  { wrong: new RegExp(`${NOT_CYR}(вы|со|з|пере|за|про|у|с|о)дает(ся)?${END}`), right: '…даёт(ся)' },
  { wrong: new RegExp(`${NOT_CYR}остается${END}`), right: 'остаётся' },
  { wrong: /прием(?!лем)/, right: 'приём' },
  { wrong: new RegExp(`${NOT_CYR}объем`), right: 'объём' },
  { wrong: new RegExp(`${NOT_CYR}подъем`), right: 'подъём' },
  { wrong: new RegExp(`${NOT_CYR}трех`), right: 'трёх' },
  { wrong: new RegExp(`${NOT_CYR}четырех`), right: 'четырёх' },
  { wrong: new RegExp(`${NOT_CYR}перенес${END}`), right: 'перенёс' },
  { wrong: new RegExp(`${NOT_CYR}принес${END}`), right: 'принёс' },
  { wrong: new RegExp(`${NOT_CYR}черн(ый|ая|ое|ые|ого|ой|ым|ых|ую|ом)${END}`), right: 'чёрн…' },
  { wrong: new RegExp(`обновлен${PARTICIPLE}`), right: 'обновлён' },
  { wrong: new RegExp(`отменен${PARTICIPLE}`), right: 'отменён' },
  { wrong: new RegExp(`сохранен${PARTICIPLE}`), right: 'сохранён' },
  { wrong: new RegExp(`удален${PARTICIPLE}`), right: 'удалён' },
  { wrong: new RegExp(`изменен${PARTICIPLE}`), right: 'изменён' },
  { wrong: new RegExp(`завершен${PARTICIPLE}`), right: 'завершён' },
  { wrong: new RegExp(`определен${PARTICIPLE}`), right: 'определён' },
  { wrong: new RegExp(`применен${PARTICIPLE}`), right: 'применён' },
  { wrong: new RegExp(`(?<!вы)ключен${PARTICIPLE}`), right: '…ключён' },
  { wrong: new RegExp(`(?<!вы)веден${PARTICIPLE}`), right: '…ведён' },
  { wrong: new RegExp(`продлен${PARTICIPLE}`), right: 'продлён' },
  { wrong: new RegExp(`твержден${PARTICIPLE}`), right: '…тверждён' },
  { wrong: new RegExp(`(?<!вы)несен${PARTICIPLE}`), right: '…несён' },
  { wrong: new RegExp(`${NOT_CYR}учтен${PARTICIPLE}`), right: 'учтён' },
  { wrong: new RegExp(`${NOT_CYR}(за|про|со)чтен${PARTICIPLE}`), right: '…чтён' }
];

const collect = (dir: string, exts: string[], acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      /* CSS в строках-шаблонах: комментарии внутри строк не снимаются, а текста для человека там нет. */
      if (entry === 'styles' && full.includes('/packages/ui/src/')) continue;
      collect(full, exts, acc);
      continue;
    }
    if (exts.some((ext) => entry.endsWith(ext)) && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');

/** Строки (и текст между тегами разметки) с кириллицей — то, что читает человек. */
const userTextsOf = (code: string, jsx: boolean): string[] => {
  const out: string[] = [];
  for (const m of code.matchAll(
    /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
  )) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  if (jsx) for (const m of code.matchAll(/>([^<>{}]*[а-яё][^<>{}]*)</gi)) out.push(m[1]!);
  return out.filter((text) => /[а-яё]/i.test(text));
};

const offendersIn = (files: string[], jsx: boolean): string[] => {
  const offenders: string[] = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const text of userTextsOf(code, jsx)) {
      const lowered = text.toLowerCase();
      for (const rule of RULES) {
        const hit = rule.wrong.exec(lowered);
        if (hit)
          offenders.push(`${rel(file)}: «${hit[0]}» → «${rule.right}» в «${text.slice(0, 60)}»`);
      }
    }
  }
  return offenders;
};

describe('везде с ё (ТЗ 4.3)', () => {
  it('словарь не трогает слова, которые пишутся через «е»', () => {
    const safe = [
      'черновик',
      'выполнен',
      'легко',
      'счета',
      'ожидает',
      'завершена',
      'завершено',
      'подключение',
      'выключен',
      'приемлемо',
      'все',
      'обедает'
    ];
    for (const word of safe) {
      expect(
        RULES.some((rule) => rule.wrong.test(word)),
        `«${word}» пишется через «е»`
      ).toBe(false);
    }
    const wrong = [
      'еще',
      'отчет',
      'учет',
      'идет',
      'найдет',
      'завершен',
      'завершенный',
      'удаленно',
      'подключен',
      'выдается',
      'прием',
      'трехдневный'
    ];
    for (const word of wrong) {
      expect(
        RULES.some((rule) => rule.wrong.test(word)),
        `«${word}» обязан быть с «ё»`
      ).toBe(true);
    }
  });

  it('экраны: ни одного слова с «е» вместо «ё»', () => {
    const files = FRONT_ROOTS.flatMap((root) => collect(root, ['.ts', '.tsx']));
    expect(files.length, 'сканер видит достаточно файлов').toBeGreaterThan(200);
    expect(offendersIn(files, true)).toEqual([]);
  });

  it('сервер, письма, выгрузки, воркер и realtime: то же правило', () => {
    const files = BACK_ROOTS.flatMap((root) => collect(root, ['.ts']));
    expect(files.length).toBeGreaterThan(200);
    expect(offendersIn(files, false)).toEqual([]);
  });

  it('посевы миграций (шаблоны писем и документов): то же правило', () => {
    const files = collect(MIGRATIONS, ['.sql']);
    expect(files.length).toBeGreaterThan(50);
    expect(offendersIn(files, false)).toEqual([]);
  });
});
