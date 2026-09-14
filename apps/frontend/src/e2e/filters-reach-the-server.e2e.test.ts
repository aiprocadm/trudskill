import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { BACKEND_SRC, stripComments } from './backend-source';

/**
 * Отбор, который человек видит на экране, обязан дойти до сервера.
 *
 * Списки страничные: сервер отдаёт двадцать строк и общее число. Отбор, применённый НА МЕСТЕ
 * или ушедший под именем, которого сервер не читает, оставляет человека наедине с неполным
 * списком — и ничем себя не выдаёт. Экран не падает, сервер отвечает 200, в журналах чисто:
 * обход страниц такое не ловит, и не должен. Ломается только смысл.
 *
 * Так и было на трёх экранах раздела «Оценивание» (журнал 389, 390), причём двумя способами
 * сразу и на одном и том же отборе по курсу:
 *
 * 1. Экран отбирал на месте, по уже полученной странице, и рядом стояло объяснение «фильтр
 *    по курсу сервер не принимает». **Сервер принимал его всегда** — `course_id` есть в
 *    `BaseFilterQuery`, а общий помощник `list()` применяет его к любой сущности с полем
 *    `courseId`. Проверено живьём: без отбора `total: 1`, с чужим курсом `total: 0`.
 * 2. Слой запросов при этом УЖЕ собирал отбор — и клал его в адрес под именем `courseId`,
 *    которого сервер не читает. То есть даже попытка отобрать на сервере была безмолвно
 *    бесполезной, и именно поэтому объяснение в пункте 1 выглядело правдой: кто-то
 *    попробовал, не получил разницы и записал вывод рядом с кодом.
 *
 * Отсюда две проверки: значение доходит ДО слоя запросов (первая) и уходит в адрес под
 * тем именем, которое сервер читает (вторая). Порознь каждая пропускает половину.
 *
 * Эталон рядом: `users` (`role`), `courses` (`direction_id`), `analytics` (пять отборов) —
 * все кладут значение в объект запроса, а слой запросов пишет змеиный регистр.
 *
 * ⚠️ У фронта ДВА соглашения об именах, и это осознанно: экраны и типы разделов говорят
 * на `courseId`/`pageSize`, а в адрес уходит `course_id`/`page_size`. Перевод делает слой
 * запросов (`api.ts` раздела). Поэтому вторая проверка смотрит именно на адрес, а не на
 * экран: «исправить» экран под змеиный регистр значило бы сломать работающий перевод.
 */

const FEATURES = fromApp('src', 'features');

const filesUnder = (dir: string, ends: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      filesUnder(full, ends, acc);
      continue;
    }
    if (entry.endsWith(ends) && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

/**
 * Имена параметров строки запроса, которые сервер ЧИТАЕТ.
 *
 * Собирается из трёх мест сразу, потому что читают по-разному: именованным параметром
 * (`@Query('from')`), обращением к полю разобранного запроса (`query.course_id`) и
 * объявлением общего набора отборов (`BaseFilterQuery`). Список нарочно щедрый: пропустить
 * настоящее имя значит покрасить здоровый код, а это хуже, чем пропустить одну ошибку.
 */
const serverQueryKeys = (): Set<string> => {
  const keys = new Set<string>();
  for (const file of filesUnder(BACKEND_SRC, '.ts')) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const m of code.matchAll(/@Query\(\s*'([^']+)'/g)) keys.add(m[1]!);
    for (const m of code.matchAll(/\bquery\.([A-Za-z_$][\w$]*)\b/g)) keys.add(m[1]!);
  }
  const base = readFileSync(join(BACKEND_SRC, 'modules', 'mvp', 'mvp.dto.ts'), 'utf8');
  const block = /export interface BaseFilterQuery \{([\s\S]*?)\n\}/.exec(base);
  for (const m of (block?.[1] ?? '').matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)) keys.add(m[1]!);
  return keys;
};

/** `activeCount={[a, b, c].filter(Boolean).length}` — что экран называет активными отборами. */
const ACTIVE_COUNT = /activeCount=\{\[([^\]]*)\]\.filter\(Boolean\)\.length\}/g;

/**
 * Ближайшая незакрытая открывающая скобка слева. Нужна, чтобы отличить сокращённую запись
 * свойства объекта `{ … , courseId }` от перечня зависимостей `[q, status, courseId, page]`:
 * снаружи они выглядят одинаково — имя между запятыми, — а значат противоположное.
 */
const enclosingBracket = (code: string, at: number): number => {
  let depth = 0;
  for (let i = at - 1; i >= 0; i -= 1) {
    const char = code[i]!;
    if (char === ')' || char === ']' || char === '}') depth += 1;
    else if (char === '(' || char === '[' || char === '{') {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
};

/**
 * Объектный литерал ли это. Фигурная скобка после знака равенства — не объект, а привязка
 * к элементу управления в разметке (`value={courseId}`): значение показывается человеку,
 * а на сервер не уходит. Обе ловушки — перечень зависимостей и привязка — по очереди
 * зеленили сторожа на подсаженной поломке, и обе разобраны здесь.
 */
const isObjectLiteral = (code: string, at: number): boolean => {
  const open = enclosingBracket(code, at);
  if (open === -1 || code[open] !== '{') return false;
  return !/=\s*$/.test(code.slice(Math.max(0, open - 3), open));
};

describe('отбор с экрана доходит до сервера', () => {
  it('каждый отбор из activeCount попадает в объект запроса', () => {
    const broken: string[] = [];

    for (const file of filesUnder(FEATURES, '.tsx')) {
      const code = stripComments(readFileSync(file, 'utf8'));
      const relative = file.slice(FEATURES.length + 1);

      for (const match of code.matchAll(ACTIVE_COUNT)) {
        const names = match[1]!
          .split(',')
          .map((part) => part.trim())
          .filter((part) => /^[A-Za-z_$][\w$]*$/.test(part));

        /*
         * Сам перечень из `activeCount` из поиска убирается: `[q, status, courseId]` иначе
         * сошёл бы за сокращённую запись свойства объекта, и сторож всегда был бы зелёным.
         */
        const withoutList = code.slice(0, match.index) + code.slice(match.index + match[0].length);

        for (const name of names) {
          const asProperty = new RegExp(`\\b\\w+\\s*:\\s*${name}\\b`).test(withoutList);

          let asShorthand = false;
          for (const use of withoutList.matchAll(new RegExp(`(?<![.\\w])${name}\\b`, 'g'))) {
            /*
             * Окно шире одной строки: в объекте на несколько строк перед именем стоят перенос
             * и отступ, а не сразу скобка. На узком окне сторож считал нарушением здоровые
             * экраны.
             */
            const before = withoutList.slice(Math.max(0, use.index - 60), use.index);
            const after = withoutList.slice(use.index + name.length).trimStart()[0];
            if (!/[{,]\s*$/.test(before) || (after !== '}' && after !== ',')) continue;
            if (isObjectLiteral(withoutList, use.index)) {
              asShorthand = true;
              break;
            }
          }

          if (!asProperty && !asShorthand) {
            broken.push(`${relative}: отбор «${name}» на сервер не уходит`);
          }
        }
      }
    }

    expect(
      broken,
      `отборы, которые просеивают только текущую страницу:\n${broken.join('\n')}`
    ).toEqual([]);
  });

  /**
   * Имя параметра в адресе — такое, какое сервер ЧИТАЕТ. Иначе параметр молча пропадает,
   * а отбор выглядит применённым. Ровно так пропадал отбор по курсу (журнал 390): слой
   * запросов честно собирал его в адрес — под именем `courseId`, тогда как читается
   * `course_id`.
   *
   * ⚠️ Правило «всё в змеином регистре» НЕ годится и было отвергнуто на живом коде: у
   * сервера соглашения разные по модулям. Списки MVP читают `course_id` и `page_size`, а
   * книга выдачи документов — `groupOrderDocumentId`, и это не ошибка.
   *
   * Проверка ДОКАЗУЕМАЯ и потому узкая: сторож собирает имена, которые сервер читает на
   * самом деле, и ругается только тогда, когда у написанного имени есть змеиный двойник
   * из этого набора. `courseId` при живом `course_id` — заведомо ошибка; `groupOrderDocumentId`,
   * у которого двойника нет, сторож не трогает. Просто «неизвестное имя» нарушением не
   * считается: набор собран грубым разбором, и красить им здоровый код нельзя.
   *
   * Проверяются места, где адрес и собирается: `qs({…})` и `params.set('…')`.
   */
  it('ключи в адресе запроса написаны так, как их читает сервер', () => {
    const known = serverQueryKeys();
    const wrong: string[] = [];

    /** `courseId` → `course_id`. Нарушение — только если такой двойник сервером читается. */
    const snakeTwin = (key: string): string | null => {
      const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      return snake !== key && known.has(snake) ? snake : null;
    };

    for (const file of filesUnder(FEATURES, 'api.ts')) {
      const code = stripComments(readFileSync(file, 'utf8'));
      const relative = file.slice(FEATURES.length + 1);
      const at = (index: number) => code.slice(0, index).split('\n').length;

      for (const call of code.matchAll(/\bqs\(\{/g)) {
        const open = call.index + call[0].length - 1;
        let depth = 0;
        let end = open;
        for (let i = open; i < code.length; i += 1) {
          if (code[i] === '{') depth += 1;
          else if (code[i] === '}') {
            depth -= 1;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        for (const key of code.slice(open, end).matchAll(/(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*:/g)) {
          const twin = snakeTwin(key[1]!);
          if (twin) {
            wrong.push(
              `${relative}:${at(open)} — ключ адреса «${key[1]}»; сервер читает «${twin}»`
            );
          }
        }
      }

      for (const key of code.matchAll(/params\.(?:set|append)\(\s*'([^']+)'/g)) {
        const twin = snakeTwin(key[1]!);
        if (twin) {
          wrong.push(
            `${relative}:${at(key.index)} — ключ адреса «${key[1]}»; сервер читает «${twin}»`
          );
        }
      }
    }

    expect(wrong, `параметры, которые молча пропадают:\n${wrong.join('\n')}`).toEqual([]);
  });

  /**
   * Третья грань того же: отбор обязан возвращать на первую страницу.
   *
   * Человек листает до третьей страницы, выбирает курс — и попадает на третью страницу
   * результата, в котором страниц всего одна. Экран показывает пусто, хотя записи есть.
   * На соседних отборах (поиск, статус) сброс стоял; на отборе по курсу — нет, и это не
   * было видно ровно потому, что отбор не доходил до сервера и страниц не менял (журнал 391).
   *
   * Признак нарушения простой: обработчик — голая ссылка на установщик значения
   * (`onChange={setCourseId}`). Через неё номер страницы сбросить негде.
   */
  it('смена отбора возвращает на первую страницу', () => {
    const bare: string[] = [];

    for (const file of filesUnder(FEATURES, '.tsx')) {
      const code = stripComments(readFileSync(file, 'utf8'));
      if (!/\bsetPage\s*\(/.test(code)) continue;
      const relative = file.slice(FEATURES.length + 1);

      for (const match of code.matchAll(ACTIVE_COUNT)) {
        const names = match[1]!
          .split(',')
          .map((part) => part.trim())
          .filter((part) => /^[A-Za-z_$][\w$]*$/.test(part));

        for (const name of names) {
          const setter = `set${name[0]!.toUpperCase()}${name.slice(1)}`;
          if (new RegExp(`onChange=\\{${setter}\\}`).test(code)) {
            bare.push(`${relative}: отбор «${name}» меняется, а страница остаётся прежней`);
          }
        }
      }
    }

    expect(bare, `отборы без возврата на первую страницу:\n${bare.join('\n')}`).toEqual([]);
  });
});
