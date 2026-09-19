import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Пункт 3 чек-листа приёмки целиком: технической лексики на экранах нет (ТЗ 16.3).
 *
 * **Что просит ТЗ.** «ESLint-правило (или тест по собранной сборке), запрещающее в
 * пользовательских строках: `noop`, `fake`, `bbb`, `tenant`, `backend`, `textBody`, `Manager`,
 * `Methodist`, `Platform admin`, `Tenant admin`, «тенант», «джобы»». Двенадцать слов.
 *
 * **Что уже было закрыто и чем.** «Тенант», «джобы», `tenant` в русской фразе и код в скобках
 * (`(noop)`, `(fake)`, `(bbb)`) держит `no-technical-words`; английские имена ролей —
 * `roles-speak-russian` (он сверяет ВСЕ источники имён со словарём Р1). Оставались непокрытыми
 * `noop`, `fake`, `bbb` голым словом (не в скобках), `backend` и `textBody`.
 *
 * Здесь список ТЗ держится **одним реестром**, а не расползается по трём сторожам: чек-лист
 * приёмки читается построчно, и «какие из двенадцати слов проверяются» должно быть видно в
 * одном месте. Сторожа, закрывающие часть списка, названы поимённо — дублировать их проверки
 * незачем, а вот потерять слово при следующей правке легко.
 *
 * **Почему по пользовательским строкам, а не по всему исходнику.** `tenantId` в имени
 * переменной — не нарушение, а нормальное имя поля; `textBody` в типе материала — тоже.
 * Нарушение — когда это слово ЧИТАЕТ человек. Поэтому берутся строковые литералы и текст
 * между тегами разметки, а комментарии снимаются.
 */

const ROOTS = [
  fromApp('src', 'features'),
  fromApp('src', 'widgets'),
  fromApp('src', 'components'),
  fromApp('app'),
  fromPackages('ui', 'src')
];
const BACKEND_MODULES = fromApp('..', 'backend', 'src', 'modules');

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/**
 * Текст, который может прочитать человек: строковые литералы и содержимое между тегами.
 *
 * Строка вида `/admin/tests` или `application/json` — не текст для человека, а адрес и тип
 * данных. Поэтому отсеиваются строки без единой буквы русского алфавита и пробела: слово из
 * списка внутри технической строки — это код, а не подпись.
 */
const userTextsOf = (code: string): string[] => {
  const out: string[] = [];
  for (const m of code.matchAll(
    /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
  )) {
    const text = m[1] ?? m[2] ?? m[3] ?? '';
    if (/[а-яё]/i.test(text)) out.push(text);
  }
  for (const m of code.matchAll(/>([^<>{}]*[а-яё][^<>{}]*)</gi)) out.push(m[1]!);
  return out;
};

/**
 * Реестр пункта 3. `owner` — сторож, который держит слово; `here` — проверяется этим файлом.
 *
 * Реестр сверяется на равенство со списком ТЗ: слово, выпавшее из него при правке, уронит
 * отдельную проверку, а не растворится молча.
 */
const CHECKLIST: Array<{ word: string; owner: string; here?: RegExp; why?: string }> = [
  {
    word: 'noop',
    owner: 'здесь',
    here: /\bnoop\b/i,
    why: 'код «ничего не делаем» вместо «Отключено»'
  },
  { word: 'fake', owner: 'здесь', here: /\bfake\b/i, why: 'код вместо «Тестовый режим»' },
  { word: 'bbb', owner: 'здесь', here: /\bbbb\b/i, why: 'код площадки вместо её имени' },
  { word: 'tenant', owner: 'no-technical-words' },
  {
    word: 'backend',
    owner: 'здесь',
    here: /\bback[- ]?end\b/i,
    why: 'внутреннее устройство продукта человеку ничего не объясняет'
  },
  {
    word: 'textBody',
    owner: 'здесь',
    here: /\btextBody\b/,
    why: 'имя поля вместо «Текст материала»'
  },
  { word: 'Manager', owner: 'roles-speak-russian' },
  { word: 'Methodist', owner: 'roles-speak-russian' },
  { word: 'Platform admin', owner: 'roles-speak-russian' },
  { word: 'Tenant admin', owner: 'roles-speak-russian' },
  { word: 'тенант', owner: 'no-technical-words' },
  { word: 'джобы', owner: 'no-technical-words' }
];

describe('пункт 3 чек-листа приёмки: технической лексики на экранах нет (ТЗ 16.3)', () => {
  it('реестр совпадает со списком ТЗ — ни одно слово не потеряно', () => {
    /*
     * Список ТЗ выписан дословно. Сверка на равенство: слово, выпавшее при правке реестра,
     * уронит эту проверку, а не растворится молча — ровно то, чего требует фаза 16.
     */
    expect(CHECKLIST.map((item) => item.word)).toEqual([
      'noop',
      'fake',
      'bbb',
      'tenant',
      'backend',
      'textBody',
      'Manager',
      'Methodist',
      'Platform admin',
      'Tenant admin',
      'тенант',
      'джобы'
    ]);
  });

  it('у каждого слова назван сторож, который его держит', () => {
    const orphans = CHECKLIST.filter((item) => !item.owner.trim()).map((item) => item.word);
    expect(orphans, 'слово без сторожа — строка в чек-листе без проверки').toEqual([]);

    const here = CHECKLIST.filter((item) => item.owner === 'здесь');
    for (const item of here) {
      expect(item.here, `${item.word}: сторож «здесь», а образца нет`).toBeTruthy();
      expect(item.why, `${item.word}: не сказано, чем слово плохо для человека`).toBeTruthy();
    }
    expect(here.length, 'часть списка проверяется здесь, часть — названными сторожами').toBe(5);
  });

  it('ни один экран не показывает слов из списка', () => {
    const checks = CHECKLIST.filter((item): item is (typeof CHECKLIST)[number] & { here: RegExp } =>
      Boolean(item.here)
    );
    const offenders: string[] = [];

    for (const file of ROOTS.flatMap((root) => collect(root))) {
      for (const text of userTextsOf(read(file))) {
        for (const item of checks) {
          if (item.here.test(text)) {
            offenders.push(`${rel(file)}: «${item.word}» — «${text.slice(0, 70)}»`);
          }
        }
      }
    }

    expect(
      [...new Set(offenders)].sort(),
      'слово из пункта 3 чек-листа приёмки видно человеку на экране'
    ).toEqual([]);
  });

  it('сообщения сервера тоже не показывают этих слов', () => {
    /*
     * Сообщение сервера доезжает до экрана как есть (`error-text.ts` показывает `message`,
     * если статьи в словаре нет), поэтому проверять только фронт было бы половиной работы.
     */
    const checks = CHECKLIST.filter((item): item is (typeof CHECKLIST)[number] & { here: RegExp } =>
      Boolean(item.here)
    );
    const offenders: string[] = [];

    for (const file of collect(BACKEND_MODULES)) {
      for (const m of read(file).matchAll(/message:\s*'([^']*)'/g)) {
        const text = m[1] ?? '';
        if (!/[а-яё]/i.test(text)) continue;
        for (const item of checks) {
          if (item.here.test(text)) offenders.push(`${rel(file)}: «${item.word}» — «${text}»`);
        }
      }
    }

    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  it('мерка не выродилась: подложенная фраза со словом из списка ловится', () => {
    /*
     * Самопроверка. Если бы `userTextsOf` перестал видеть тексты или образцы перестали
     * совпадать, все проверки выше стали бы зелёными ни на чём — а это худший вид сторожа.
     */
    const sample = "const a = 'Режим noop недоступен';\nconst b = 'Ошибка backend при сохранении';";
    const texts = userTextsOf(sample);
    expect(texts.length, 'разбор строк сломался').toBe(2);

    const hits = CHECKLIST.filter((item) => item.here && texts.some((t) => item.here!.test(t)));
    expect(hits.map((item) => item.word).sort()).toEqual(['backend', 'noop']);
  });
});
