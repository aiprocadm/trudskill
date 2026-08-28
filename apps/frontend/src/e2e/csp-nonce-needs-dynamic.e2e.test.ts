/**
 * Сторож ФТ-G7: метка на скриптах требует, чтобы страница собиралась НА ЗАПРОС.
 *
 * Чем куплен. Стенд лежал с белым экраном «Загрузка приложения...»: браузер блокировал
 * ВСЕ 19 скриптов сайта. Причина — два верных по отдельности решения, несовместимые вместе:
 *
 *  1. Политика безопасности помечает свои скрипты одноразовым числом (nonce) и говорит
 *     браузеру «выполняй только помеченные» (`strict-dynamic` отменяет доверие по адресу).
 *  2. Страницы собирались ЗАРАНЕЕ, на сборке. В тот момент запроса ещё нет, числа ещё нет,
 *     пометить нечем — и в готовый HTML метка уже не попадёт никогда.
 *
 * Итог: политика требует метку, которой в HTML нет. Приложение не оживает вообще, а на
 * экране это выглядит как вечная загрузка — ни ошибки, ни подсказки.
 *
 * Документация Next говорит об этом прямо: «при использовании nonce ВСЕ страницы должны
 * собираться динамически; статические страницы собраны на сборке, где нет ни запроса, ни
 * заголовков, поэтому вставить метку некуда».
 *
 * Поэтому сторож связывает два файла, которые иначе живут отдельно и расходятся молча:
 * пока политика помечает скрипты — корневой макет обязан дожидаться настоящего запроса.
 *
 * Почему сторож читает исходники, а не открывает браузер: во фронте нет монтирования React,
 * а поймать это на живом сервере можно только после полной сборки — слишком поздно.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): string => readFileSync(join(frontendRoot, path), 'utf8');

const policySource = read('src/lib/security/csp.ts');
const rootLayout = read('app/layout.tsx');

/** Политика помечает скрипты меткой ответа? Тогда динамическая сборка обязательна. */
const policyUsesNonce =
  policySource.includes("`'nonce-${nonce}'`") || policySource.includes("'strict-dynamic'");

const collectPageFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectPageFiles(full, acc);
      continue;
    }
    if (/\.(t|j)sx?$/.test(entry)) acc.push(full);
  }
  return acc;
};

describe('политика с меткой и сборка страниц не расходятся', () => {
  it('политика действительно помечает скрипты — иначе сторож бессмыслен', () => {
    expect(policyUsesNonce).toBe(true);
  });

  it('корневой макет дожидается настоящего запроса (connection)', () => {
    expect(rootLayout).toContain("from 'next/server'");
    expect(rootLayout).toContain('connection');
    expect(rootLayout).toMatch(/await\s+connection\(\)/);
  });

  it('корневой макет асинхронный — без этого ожидание запроса невозможно', () => {
    expect(rootLayout).toMatch(/export default async function RootLayout/);
  });

  it('ни одна страница не возвращает сборку заранее (force-static / revalidate)', () => {
    const offenders = collectPageFiles(join(frontendRoot, 'app'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return (
          /export\s+const\s+dynamic\s*=\s*['"]force-static['"]/.test(source) ||
          /export\s+const\s+revalidate\s*=/.test(source)
        );
      })
      .map((file) => relative(frontendRoot, file));

    expect(offenders).toEqual([]);
  });
});
