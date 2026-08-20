import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Ключи блокировок фоновых задач уникальны, и каждая задача блокировку берёт.
 *
 * Зачем это нужно словами. Ночные задачи (удалить просроченные видеозаписи экзаменов,
 * закрыть зависшие попытки, разослать напоминания) должны выполняться РОВНО ОДИН РАЗ, даже
 * когда бэкенд запущен в нескольких экземплярах. Для этого задача перед работой берёт в базе
 * именной «замок»: кто взял — тот и работает, остальные тихо пропускают прогон.
 *
 * Две беды, которые ловит этот файл:
 *
 * 1. **Задача без замка.** При нескольких экземплярах она выполнится столько раз, сколько
 *    экземпляров: напоминания уйдут дважды, удаление отработает дважды. Это прямо мешает
 *    самому дешёвому шагу по §12.1 — «запустить несколько экземпляров за прокси».
 *
 * 2. **Две задачи с ОДНИМ ключом.** Они начинают блокировать друг друга, и проигравшая
 *    молча не выполняется — без ошибки, без записи в журнал. Ровно это и было найдено:
 *    удаление видеозаписей прокторинга (раз в сутки, в 05:00) и закрытие просроченных
 *    попыток (каждые пять минут) держали один ключ `528_493`. В 05:00 они
 *    стартуют вместе, и суточная задача может проигрывать гонку **каждый раз** — видео с
 *    персональными данными тогда не удаляются вовсе, вопреки сроку хранения (152-ФЗ).
 *
 * Проверено подсадным нарушителем: возврат общего ключа роняет тест.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const KEY = /const\s+([A-Z_]*LOCK_KEY)\s*=\s*([0-9_]+)/g;
const STATIC_KEY = /readonly\s+([A-Z_]*LOCK_KEY)\s*=\s*([0-9_]+)/g;

interface LockDeclaration {
  file: string;
  name: string;
  value: string;
}

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
};

const declarations = (): LockDeclaration[] => {
  const found: LockDeclaration[] = [];
  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of [KEY, STATIC_KEY]) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        found.push({
          file: file
            .slice(SRC.length + 1)
            .split(sep)
            .join('/'),
          name: match[1]!,
          value: match[2]!.replace(/_/g, '')
        });
      }
    }
  }
  return found;
};

/** Файлы с расписанием: `@Cron(...)` или `@Interval(...)`. */
const scheduledFiles = (): string[] =>
  walk(SRC).filter((file) => /@(Cron|Interval)\(/.test(readFileSync(file, 'utf8')));

describe('замки фоновых задач', () => {
  it('объявленные ключи вообще находятся — иначе проверка пустая', () => {
    expect(declarations().length).toBeGreaterThanOrEqual(5);
  });

  /*
   * Ключевая проверка. Один ключ на две задачи — это молчаливый пропуск одной из них.
   */
  it('один ключ не используется двумя задачами', () => {
    const byValue = new Map<string, LockDeclaration[]>();
    for (const declaration of declarations()) {
      const list = byValue.get(declaration.value) ?? [];
      list.push(declaration);
      byValue.set(declaration.value, list);
    }

    const collisions = [...byValue.entries()]
      .filter(([, list]) => new Set(list.map((d) => d.file)).size > 1)
      .map(
        ([value, list]) =>
          `ключ ${value} занят несколькими задачами: ${list.map((d) => `${d.file} (${d.name})`).join(', ')}`
      );

    expect(
      collisions,
      'Две фоновые задачи держат один замок и блокируют друг друга: та, что проиграет ' +
        'гонку, молча не выполнится — без ошибки и без следа в журнале. Дайте каждой ' +
        'задаче свой ключ.'
    ).toEqual([]);
  });

  /*
   * Вторая половина: задача с расписанием обязана брать замок, иначе при нескольких
   * экземплярах бэкенда она отработает столько раз, сколько экземпляров запущено.
   */
  it('каждая задача с расписанием берёт замок', () => {
    const unlocked = scheduledFiles()
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return !source.includes('pg_try_advisory') && !source.includes('LOCK_KEY');
      })
      .map((file) =>
        file
          .slice(SRC.length + 1)
          .split(sep)
          .join('/')
      );

    expect(
      unlocked,
      'Задача по расписанию не берёт замок. При запуске нескольких экземпляров бэкенда ' +
        '(самый дешёвый шаг по §12.1) она выполнится столько раз, сколько экземпляров: ' +
        'напоминания уйдут дважды, удаление отработает дважды.'
    ).toEqual([]);
  });
});
