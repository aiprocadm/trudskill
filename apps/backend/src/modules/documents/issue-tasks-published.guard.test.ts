import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES = resolve(HERE, '..');

/**
 * Сторож журнала 663: «создал задачу выпуска — отправь её в очередь».
 *
 * Рабочий выпуск берёт задачи только из очереди. Дефект 662 прожил с Фазы 1: три входа
 * «Закрыть группу» создавали задачи и не публиковали их — протокол и удостоверения стояли
 * «в очереди» навсегда. Здесь каждый вызов, создающий или возвращающий в очередь задачи, в
 * контроллерах и цепочке закрытия обязан стоять в той же функции, что и публикация.
 */
const FILES = [
  'documents/documents.controller.ts',
  'mvp/mvp.controller.ts',
  'mvp/close-group-chain.service.ts',
  'mvp/groups/group-package.controller.ts'
];

const CREATORS = [
  '.generateDocument(',
  '.generateDocumentsBatch(',
  '.retryTask(',
  '.closeGroup(',
  '.closeGroupWithChecks(',
  '.issueGroupPackage(',
  'this.packages.issue('
];

const PUBLISHERS = ['publishQueuedTasks', 'publishGenerationJob'];

/** Тело функции вокруг позиции: от ближайшего начала метода выше до следующего ниже. */
const methodAround = (source: string, index: number): string => {
  const methodStart = /\n {2}(?:async )?[a-zA-Z]+\(/g;
  let start = 0;
  let end = source.length;
  for (const match of source.matchAll(methodStart)) {
    if (match.index! < index) start = match.index!;
    else {
      end = match.index!;
      break;
    }
  }
  return source.slice(start, end);
};

describe('задача выпуска создана — задача опубликована (журнал 663)', () => {
  it('каждый вызов, создающий задачи, публикует их в той же функции', () => {
    const offenders: string[] = [];
    let calls = 0;
    for (const file of FILES) {
      const source = readFileSync(resolve(MODULES, file), 'utf8');
      for (const creator of CREATORS) {
        let from = 0;
        for (;;) {
          const at = source.indexOf(creator, from);
          if (at < 0) break;
          calls += 1;
          const body = methodAround(source, at);
          if (!PUBLISHERS.some((p) => body.includes(p))) {
            const line = source.slice(0, at).split('\n').length;
            offenders.push(`${file}:${line} ${creator}`);
          }
          from = at + creator.length;
        }
      }
    }
    // Сторож, который ничего не нашёл, ничего и не сторожит.
    expect(calls).toBeGreaterThanOrEqual(6);
    expect(offenders).toEqual([]);
  });
});
