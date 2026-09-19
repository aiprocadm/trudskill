import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Обратная кавычка внутри строки стилей закрывает её досрочно.
 *
 * Каждый файл в этой папке — одна большая строка CSS в обратных кавычках. Поставить такую
 * кавычку в CSS-комментарии (скажем, обрамив имя свойства) значит закрыть строку посреди
 * файла: остаток кода становится невалидным TypeScript, и сборка падает сообщением про
 * неожиданный идентификатор — то есть указывает куда угодно, только не на комментарий.
 *
 * Такой сторож уже был, но смотрел на ОДИН файл (`sidebar-is-its-own-column`, боковая панель).
 * За одну сессию на те же грабли наступили дважды — в `shell.ts` и в `foundation.ts`, — потому
 * что остальные файлы никто не проверял (журнал 562). Проверка распространена на всю папку:
 * новый файл стилей попадает под неё сам, без правки списка.
 */

const here = dirname(fileURLToPath(import.meta.url));

const styleFiles = readdirSync(here)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'index.ts')
  .sort();

describe('в строках стилей нет обратных кавычек', () => {
  it('файлы стилей вообще найдены', () => {
    /* Пустой список прошёл бы молча и не проверил ничего. */
    expect(styleFiles.length).toBeGreaterThan(5);
  });

  it.each(styleFiles)('%s', (name) => {
    const source = readFileSync(resolve(here, name), 'utf8');
    const offenders: string[] = [];

    /*
     * Ищем каждую строку в обратных кавычках и смотрим, что внутри. Разбирать весь файл
     * разборщиком TypeScript было бы точнее, но дороже: нам хватает того, что у объявления
     * стилей обратные кавычки идут парой и между ними третьей быть не должно.
     */
    const declaration = /export const \w+ = `/g;
    let match: RegExpExecArray | null;
    while ((match = declaration.exec(source)) !== null) {
      const start = match.index + match[0].length;
      const end = source.indexOf('`', start);
      if (end === -1) {
        offenders.push(`строка стилей не закрыта после позиции ${start}`);
        continue;
      }
      const rest = source.slice(end + 1);
      // После закрывающей кавычки обязан идти конец объявления, а не продолжение CSS.
      if (/^\s*[a-zA-Z0-9#.:{-]/.test(rest) && !/^\s*(;|as const|\))/.test(rest)) {
        const line = source.slice(0, end).split('\n').length;
        offenders.push(`строка ${line}: после кавычки продолжается CSS — значит кавычка лишняя`);
      }
    }

    expect(offenders, `${name}: обратная кавычка закрывает строку стилей досрочно`).toEqual([]);
  });
});
