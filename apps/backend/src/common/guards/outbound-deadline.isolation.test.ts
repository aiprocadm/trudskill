import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Одиннадцатый сторож семейства «объявлено — кто это исполняет»: **у внешнего вызова есть срок.**
 *
 * Вызов наружу — платёжный шлюз, видеохостинг, почтовый сервер, push-служба, S3, соседний
 * сервис — без предела ожидания висит столько, сколько молчит та сторона. `fetch` в Node
 * ждёт заголовки 5 минут; `web-push` и клиент S3 не ждут «сколько-то» — они ждут вечно, пока
 * TCP сам не заметит, что собеседника нет. Всё это время висит запрос человека («Оплатить»,
 * открыть видео, войти по ссылке из письма), а у воркера — задание, и очередь за ним.
 *
 * Проект умеет ставить срок: ClamAV — 30 секунд, Gotenberg — две минуты, проверка живости —
 * своё. Но сплошной сверки «каждый выход наружу ограничен» не делал никто, и так дожили до
 * дня, когда из 16 внешних вызовов backend и worker срок имели 2 (журнал 335).
 *
 * Инвариант, по видам вызовов:
 *  - `fetch` (и его инъекции `fetchImpl` / `fetchFn` — так в проекте подменяют сеть в тестах):
 *    в аргументах есть `signal` — `AbortSignal.timeout(...)` или проброшенный снаружи;
 *  - `web-push`: у `sendNotification` третий аргумент с `timeout`;
 *  - `nodemailer`: транспорт создаётся с `connectionTimeout` (и остальными сроками рядом);
 *  - `@aws-sdk/client-s3`: `new S3Client` получает `requestHandler` с `connectionTimeout`;
 *  - сырой `net`-сокет: в файле есть `setTimeout` на сокете.
 *
 * Проверено подсадным нарушителем: снятие `signal` у любого `fetch` роняет тест и называет место.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');
const WORKER_SRC = resolve(HERE, '../../../../worker/src');

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

/** Текст аргументов вызова: от открывающей скобки до парной ей. Грубо, но кода хватает. */
const callArguments = (text: string, openParen: number): string => {
  let depth = 0;
  for (let index = openParen; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openParen + 1, index);
    }
  }
  return text.slice(openParen + 1);
};

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** Комментарии гасятся пробелами: «re-fetch (the real gate)» в комментарии — не вызов. Номера строк сохраняются. */
const withoutComments = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(
      /^(\s*)\/\/.*$/gm,
      (line, indent: string) => indent + ' '.repeat(line.length - indent.length)
    );

/** Локальное имя импорта: `import { a as b } from 'x'` → `b`, `import c from 'x'` → `c`. */
const importedName = (text: string, pkg: string, exported?: string): string | undefined => {
  const statement = new RegExp(`import\\s+([^;]*?)\\s+from\\s+'${pkg}'`).exec(text)?.[1];
  if (!statement) return undefined;
  if (!exported) return /^(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)/.exec(statement)?.[1];
  const named = new RegExp(`\\b${exported}\\b(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?`).exec(statement);
  return named ? (named[1] ?? exported) : undefined;
};

type Rule = { kind: string; callee: string; marker: RegExp };

/** Вызовы наружу без срока: `<файл>:<строка> <вид>`. */
const outboundCallsWithoutDeadline = (): string[] => {
  const found: string[] = [];
  for (const file of [...sources(BACKEND_SRC), ...sources(WORKER_SRC)]) {
    const text = withoutComments(readFileSync(file, 'utf8'));
    const where = (index: number, kind: string): string =>
      `${file.slice(resolve(HERE, '../../../..').length + 1)}:${lineOf(text, index)} ${kind}`;

    const rules: Rule[] = [
      { kind: 'fetch без signal', callee: '(?:fetch|fetchImpl|fetchFn)', marker: /\bsignal\b/ }
    ];
    const webPush = importedName(text, 'web-push');
    if (webPush)
      rules.push({
        kind: 'web-push без timeout',
        callee: `${webPush}\\.sendNotification`,
        marker: /\btimeout\b/
      });
    const nodemailer = importedName(text, 'nodemailer', 'createTransport');
    if (nodemailer)
      rules.push({
        kind: 'nodemailer без connectionTimeout',
        callee: nodemailer,
        marker: /\bconnectionTimeout\b/
      });
    const s3 = importedName(text, '@aws-sdk/client-s3', 'S3Client');
    if (s3)
      rules.push({
        kind: 'S3Client без connectionTimeout',
        callee: `new\\s+${s3}`,
        marker: /\bconnectionTimeout\b/
      });

    for (const rule of rules) {
      const call = new RegExp(`(?<![\\w$])(?:this\\.|deps\\.)?${rule.callee}\\s*\\(`, 'g');
      for (const match of text.matchAll(call)) {
        const openParen = match.index + match[0].length - 1;
        const args = callArguments(text, openParen);
        if (args.trim() === '') continue; // объявление (`get fetchFn(): …`), не вызов
        if (!rule.marker.test(args)) found.push(where(match.index, rule.kind));
      }
    }

    // Сырой сокет: срок ставится не в вызове, а на сокете — достаточно, что он есть в файле.
    if (/from 'node:net'/.test(text) && /\.connect\(|createConnection\(/.test(text)) {
      if (!/\.setTimeout\(/.test(text)) found.push(where(0, 'net-сокет без setTimeout'));
    }
  }
  return found.sort();
};

describe('у внешнего вызова есть срок', () => {
  it('каждый выход наружу ограничен по времени', () => {
    expect(
      outboundCallsWithoutDeadline(),
      'Вызов наружу без предела ожидания висит столько, сколько молчит та сторона: fetch — ' +
        '5 минут, web-push и S3 — пока TCP не сдастся. Всё это время висит запрос человека или ' +
        'задание воркера. Поставьте срок: `signal: AbortSignal.timeout(ms)` у fetch, `timeout` у ' +
        'web-push, `connectionTimeout` у nodemailer и у `requestHandler` S3Client (журнал 335).'
    ).toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: если разбор сломается, список нарушителей опустеет и проверка
    // выше позеленеет ни на чём. Выходов наружу в проекте больше десятка — они обязаны находиться.
    const all = [...sources(BACKEND_SRC), ...sources(WORKER_SRC)]
      .map(
        (file) =>
          (
            withoutComments(readFileSync(file, 'utf8')).match(
              /(?<![\w$])(?:this\.|deps\.)?(?:fetch|fetchImpl|fetchFn)\s*\([^)]/g
            ) ?? []
          ).length
      )
      .reduce((sum, count) => sum + count, 0);
    expect(all).toBeGreaterThanOrEqual(10);
  });
});
