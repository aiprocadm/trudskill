import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Шестой сторож семейства «объявлено — кто это исполняет», на этот раз про очередь:
 * **у каждого типа задания есть тот, кто его публикует.**
 *
 * Воркер объявлял четыре типа (`document`, `integration`, `notification`,
 * `bulk_enrollment`), а бэкенд публиковал два. Два лишних обрабатывались ПУСТЫМ `return`:
 * воркер принимал задание, не делал ничего и помечал его выполненным — а метка защиты от
 * повторов не даёт повторить. То есть если бы такое задание кто-нибудь опубликовал, оно
 * исчезло бы молча и навсегда (журнал 328).
 *
 * Пустой обработчик хуже отсутствующего: отсутствующий падает на `default` с «Unknown job
 * type», задание уходит в повтор и дальше в карантин — то есть остаётся ВИДИМЫМ.
 *
 * Проверено подсадным нарушителем: новый тип в союзе без публикации роняет тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');
const WORKER_CONSUMER = resolve(HERE, '../../../../worker/src/message-consumer.ts');

interface PublishedElsewhere {
  jobType: string;
  why: string;
}

/**
 * Типы, которые публикует не бэкенд. Реестр решений, а не способ погасить красный тест:
 * каждая строка отвечает, КТО их публикует.
 */
const PUBLISHED_ELSEWHERE: ReadonlyArray<PublishedElsewhere> = [];

const declaredJobTypes = (): string[] => {
  const source = readFileSync(WORKER_CONSUMER, 'utf8');
  const union = source.slice(source.indexOf('export type WorkerJobType'));
  return [...union.slice(0, union.indexOf(';')).matchAll(/'([a-z_]+)'/g)].map(
    (m) => m[1] as string
  );
};

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

/** Типы, которые бэкенд действительно кладёт в очередь. */
const publishedJobTypes = (): Set<string> => {
  const published = new Set<string>();
  for (const file of sources(BACKEND_SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/jobType:\s*'([a-z_]+)'/g)) {
      if (match[1]) published.add(match[1]);
    }
  }
  return published;
};

describe('тип задания объявлен — его кто-то публикует', () => {
  it('у каждого типа из WorkerJobType есть публикация', () => {
    const published = publishedJobTypes();
    const explained = new Set(PUBLISHED_ELSEWHERE.map((item) => item.jobType));

    const orphans = declaredJobTypes()
      .filter((jobType) => !published.has(jobType) && !explained.has(jobType))
      .sort();

    expect(
      orphans,
      'Воркер объявляет тип задания, который никто не публикует. Такой тип либо мёртв, либо ' +
        '(хуже) обрабатывается пустым `return` — тогда задание исчезает молча, а метка защиты ' +
        'от повторов не даёт его повторить. Либо заведите публикацию, либо уберите тип из ' +
        'союза: тогда неожиданное задание упадёт на `default` и станет видимым в карантине.'
    ).toEqual([]);
  });

  it('реестр не устарел', () => {
    const declared = new Set(declaredJobTypes());
    const vanished = PUBLISHED_ELSEWHERE.filter((item) => !declared.has(item.jobType)).map(
      (i) => i.jobType
    );
    expect(vanished, 'типа больше нет в союзе — уберите строку из реестра').toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустой союз сделал бы проверку выше зелёной ни на чём.
    expect(declaredJobTypes().length).toBeGreaterThan(1);
    expect(publishedJobTypes().size).toBeGreaterThan(1);
  });
});
