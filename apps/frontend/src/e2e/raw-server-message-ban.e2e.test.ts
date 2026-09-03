import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT } from './app-root';

/*
 * `TXT-004` объявлено — кто его исполняет (журнал 338).
 *
 * Со среза 24 (§5.314) `ApiClientError.message` — это текст ДЛЯ ЧЕЛОВЕКА: что произошло и что
 * делать, по-русски, без кодов. Сырой ответ сервера лежит рядом, в `error.normalized.message`,
 * и нужен ровно одному месту — строке подробностей под спойлером.
 *
 * Но словарь не применяется сам: экран, который читает `normalized.message`, показывает
 * «Invalid credentials» и «Tenant is suspended; sessions are not issued» слово в слово — на
 * экране входа, то есть первом, что видит человек. Таких мест ревизия 2026-09-03 нашла восемь
 * в семи файлах, и все — на дверях: вход по паролю и TOTP, вход по ссылке, вход на экзамен,
 * настройка 2FA, рабочая сводка. `readApiMessage` ту же ошибку чинил для двенадцати экранов
 * ещё в срезе 24 — а сторожа «никто не читает сырое сообщение» не было. Теперь есть.
 *
 * Инвариант: вне тестов и вне самого словаря `.normalized.message` не читает никто. Показывать
 * человеку — `error.message` (или `describeError(error).message`, если ошибка неизвестного
 * вида); в спойлер — `error.details`.
 */

const RAW_MESSAGE = /\.normalized\.message\b/;

/** Единственные законные читатели сырого сообщения: словарь и клиент, который его применяет. */
const ALLOWED = new Set<string>(['src/lib/errors/error-text.ts', 'src/lib/api/client.ts']);

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) acc.push(full);
  }
  return acc;
};

const rawMessageReaders = (): string[] => {
  const offenders: string[] = [];
  for (const file of [...collect(join(APP_ROOT, 'src')), ...collect(join(APP_ROOT, 'app'))]) {
    const rel = file.slice(APP_ROOT.length + 1).replace(/\\/g, '/');
    if (ALLOWED.has(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (RAW_MESSAGE.test(line)) offenders.push(`${rel}:${index + 1}`);
      });
  }
  return offenders.sort();
};

describe('сырое сообщение сервера не показывается человеку (TXT-004)', () => {
  it('сканер отличает чтение сырого сообщения от похожих имён', () => {
    expect(RAW_MESSAGE.test('setError(e.normalized.message);')).toBe(true);
    expect(RAW_MESSAGE.test('  ? submitError.normalized.message')).toBe(true);
    // Человеческий текст и подробности — законные обращения.
    expect(RAW_MESSAGE.test('setError(e.message);')).toBe(false);
    expect(RAW_MESSAGE.test('details: e.details')).toBe(false);
    expect(RAW_MESSAGE.test('const { normalized } = e; normalized.code')).toBe(false);
  });

  it('вне словаря и клиента `normalized.message` не читает никто', () => {
    expect(
      rawMessageReaders(),
      '`normalized.message` — сырой ответ сервера («Invalid credentials»), а не текст для ' +
        'человека. Показывайте `error.message` (что произошло и что делать) или ' +
        '`describeError(error).message`; технический текст — в `error.details` под спойлер.'
    ).toEqual([]);
  });
});
