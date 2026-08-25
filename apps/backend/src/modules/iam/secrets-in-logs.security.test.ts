import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `ФТ-G4` · секрет не попадает в журнал.
 *
 * Вторая половина той же беды, что и хранение открытым текстом, но опаснее: журналы
 * читают шире, чем базу. То, что попало в лог, попадает и в выгрузку для расследования
 * инцидента, и в систему сбора логов, и в тикет, к которому эту выгрузку приложили. База
 * при этом может быть зашифрована идеально.
 *
 * Правило: в журнал пишется **идентификатор записи**, а не её секретное значение.
 * `logger.log('token issued', { id })` — можно; `{ token }` — нет.
 *
 * Сейчас нарушений нет — проверено поиском по коду. Тест держит это состояние: молчание
 * без сторожа означает лишь «пока никто не написал», а не «так нельзя».
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = join(HERE, '..', '..');

/** Что нельзя писать в журнал значением. */
const SECRET_NAMES = [
  'password',
  'passwordHash',
  'secret',
  'accessToken',
  'refreshToken',
  'apiKey',
  'privateKey',
  'rawToken',
  'plainSecret'
];

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (!full.endsWith('.ts')) continue;
    if (full.includes('.test.')) continue;
    acc.push(full);
  }
  return acc;
};

/**
 * Вызовы журналирования и их аргументы. Разбор построчный: тег вызова может занимать
 * несколько строк, но имя секрета в аргументах видно и так — а сложный разбор здесь
 * дал бы ложную уверенность, что мы «понимаем» код.
 */
const loggingLines = (source: string): string[] =>
  source
    .split('\n')
    .filter((line) => /(?:logger|console)\.(?:log|error|warn|debug|verbose)\(/.test(line));

describe('ФТ-G4 · секреты не попадают в журнал', () => {
  const files = collect(BACKEND_SRC);

  it('сканер видит код бэкенда', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('в журнал не пишется значение, похожее на секрет', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(BACKEND_SRC, file).split(sep).join('/');
      for (const line of loggingLines(readFileSync(file, 'utf8'))) {
        // Ищем секрет как ЗНАЧЕНИЕ: `{ token }`, `token`, `${token}` — но не как часть
        // слова («tokenId», «hasSecret») и не в тексте сообщения в кавычках.
        const withoutStrings = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
        const named = SECRET_NAMES.filter((name) =>
          new RegExp(`\\b${name}\\b(?!\\s*[:.]?\\s*(?:Id|id))`).test(withoutStrings)
        );
        if (named.length)
          offenders.push(`${rel}: ${named.join(', ')} — ${line.trim().slice(0, 90)}`);
      }
    }

    expect(
      offenders,
      `в журнал уходит секрет:\n${offenders.join('\n')}\n` +
        'Пишите идентификатор записи, а не её значение: журналы читают шире, чем базу — ' +
        'лог попадёт и в выгрузку для расследования, и в систему сбора логов.'
    ).toEqual([]);
  });
});
