import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Девятый сторож семейства, теперь про молчание: **проглоченная ошибка объясняется.**
 *
 * `catch`, который ничего не пишет в журнал, ничего не пробрасывает и не оставляет отметки,
 * бывает и совершенно законным: «этот вебхук не наш — верни `null`», «печать счёта не удалась,
 * но обязательство платить осталось», «уборка по возможности». Отличить законное от дефекта
 * машина не может — а человек, написавший строку, может, и стоит это одной строки комментария.
 *
 * Требование здесь именно такое: НЕ «обязательно логируй», а «объясни, почему тишина уместна».
 * Требовать журнал везде значило бы залить журнал шумом на путях, где ошибка ожидаема, — и
 * тогда его перестают читать, а это хуже молчания.
 *
 * Так нашёлся дефект (журнал 332): расшифровка секрета второго фактора падала — и `catch`
 * молча возвращал `null`. Дальше всё шло по ветке «неверный код»: тот же ответ, то же событие,
 * тот же счётчик. Человек с ПРАВИЛЬНЫМ кодом войти не мог, а эксплуатант видел «путается в
 * кодах». Сбой ключа не попадал никуда.
 *
 * Проверено подсадным нарушителем: снятие комментария у молчаливого `catch` роняет тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');

/** Слова, по которым видно, что ошибка не проглочена, а обработана. */
const HANDLED = /logger|console|throw|record|audit|metric|warn|captureError|reject/i;

const sources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sources(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.')) files.push(full);
  }
  return files;
};

/** Молчаливые `catch` без объяснения: `<файл>:<строка>`. */
const unexplainedSilentCatches = (): string[] => {
  const found: string[] = [];
  for (const file of sources(BACKEND_SRC)) {
    const text = readFileSync(file, 'utf8');
    // Тело без вложенных фигурных скобок: сложные обработчики почти всегда что-то делают,
    // а проглатывание — это короткий блок.
    for (const match of text.matchAll(/catch\s*(?:\([^)]*\))?\s*\{([^{}]*)\}/g)) {
      const body = match[1] ?? '';
      if (HANDLED.test(body)) continue;
      if (/\/\/|\/\*/.test(body)) continue; // объяснение на месте — этого и требуем
      const line = text.slice(0, match.index ?? 0).split('\n').length;
      found.push(`${file.slice(BACKEND_SRC.length + 1)}:${line}`);
    }
  }
  return found.sort();
};

describe('проглоченная ошибка объясняется', () => {
  it('у каждого молчаливого catch есть комментарий с причиной', () => {
    expect(
      unexplainedSilentCatches(),
      'Ошибка проглочена без единого следа и без объяснения. Иногда это правильно — вебхук ' +
        'чужой, уборка по возможности, — но тогда напишите это строкой комментария рядом. ' +
        'Молчание без причины неотличимо от забытой обработки: именно так сбой расшифровки ' +
        'секрета 2FA годами выглядел как «пользователь ввёл не тот код» (журнал 332).'
    ).toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: если разбор сломается, список станет пустым и проверка
    // выше позеленеет ни на чём. `catch` в проекте больше сотни — хотя бы часть обязана
    // находиться.
    const all = sources(BACKEND_SRC)
      .map(
        (file) => (readFileSync(file, 'utf8').match(/catch\s*(?:\([^)]*\))?\s*\{/g) ?? []).length
      )
      .reduce((sum, count) => sum + count, 0);
    expect(all).toBeGreaterThan(50);
  });
});
