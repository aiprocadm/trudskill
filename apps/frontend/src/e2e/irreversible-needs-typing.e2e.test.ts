import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * `CMP-005`: необратимое действие подтверждается ВВОДОМ, а не только цветом кнопки.
 *
 * Опасное действие отличается от обычного красной кнопкой (`tone: 'danger'`) — этого хватает,
 * пока действие можно отменить. Там, где нельзя, цвет руку не останавливает: человек нажимает
 * «Отозвать» в списке из двадцати строк, промахнувшись на одну, и вернуть уже нечего.
 *
 * Признак необратимости берётся из СОБСТВЕННОГО текста подтверждения: если оно говорит
 * человеку «отменить нельзя», «вернуть нельзя», «перевыпустить нельзя» — значит это тот самый
 * случай, и одного цвета мало. Правило хорошо тем, что не требует отдельного списка: экран,
 * который честно предупреждает о необратимости, сам себя и записывает.
 *
 * Просить надо не слово-заклинание («УДАЛИТЬ»), а признак записи — номер лицензии, имя
 * покупателя: тогда ввод подтверждает и намерение, и что выбрана та самая строка.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/** Текст, которым подтверждение само называет действие необратимым. */
const IRREVERSIBLE =
  /нельзя\s+(?:отменить|вернуть|восстановить|перевыпустить|отыграть)|необратим|не подлежит восстановлению/i;

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

/** Текст вызова `ask({ … })` — от открывающей скобки объекта до её пары. */
const confirmRequests = (source: string): Array<{ text: string; index: number }> => {
  const found: Array<{ text: string; index: number }> = [];
  for (const match of source.matchAll(/\bask\(\s*\{/g)) {
    const open = source.indexOf('{', match.index);
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          found.push({ text: source.slice(open, i + 1), index: open });
          break;
        }
      }
    }
  }
  return found;
};

const files = ROOTS.flatMap((root) => collect(root));

describe('CMP-005 · необратимое действие подтверждается вводом', () => {
  it('сторож видит подтверждения, а не пустой список', () => {
    // Поимённо, а не счётчиком: при сломанном разборе список молча опустеет (урок §5.426).
    const withConfirm = files.filter(
      (file) => confirmRequests(readFileSync(file, 'utf8')).length > 0
    );
    expect(withConfirm.length, 'вызовы `ask({…})` не найдены вовсе').toBeGreaterThan(3);
  });

  it('подтверждение, которое само говорит «нельзя отменить», требует ввода', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const request of confirmRequests(source)) {
        if (!IRREVERSIBLE.test(request.text)) continue;
        if (request.text.includes('requireTyping')) continue;
        const line = source.slice(0, request.index).split('\n').length;
        offenders.push(
          `${relative(APP_ROOT, file).replace(/\\/g, '/')}:${line} — предупреждает о ` +
            `необратимости, но подтверждается одним нажатием`
        );
      }
    }
    expect(offenders, `необратимых действий без ввода: ${offenders.length}`).toEqual([]);
  });

  it('вводить просят признак записи, а не слово-заклинание', () => {
    // «УДАЛИТЬ» подтверждает намерение, но не то, что выбрана нужная строка: человек так же
    // спокойно напишет его для соседней. Поэтому `word` — всегда значение из самой записи.
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const request of confirmRequests(source)) {
        const typing = /requireTyping:\s*\{[\s\S]*?word:\s*([^,\n]+)/.exec(request.text);
        if (!typing) continue;
        const word = typing[1]!.trim();
        // Признак записи — это выражение (`license.licenseNumber`, `label`), а не строка.
        if (!/^['"`]/.test(word)) continue;
        const line = source.slice(0, request.index).split('\n').length;
        offenders.push(
          `${relative(APP_ROOT, file).replace(/\\/g, '/')}:${line} — просит ввести ${word}, ` +
            `а не признак самой записи`
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});
