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
/**
 * Персональные данные в журнале (ревизия 2026-08-26).
 *
 * Довод тот же, что и у секретов, и для этого продукта он весомее: центр учит людей по
 * обязательным программам, и в журнал легко утекает то, что защищено 152-ФЗ. Ревизия нашла
 * два места, где адрес электронной почты писался целиком — включая ветку, работающую в
 * продакшене.
 *
 * Полный запрет был бы вреден: «письмо не дошло» разбирают именно по журналу. Поэтому
 * правило мягче — значение МАСКИРУЕТСЯ (`maskEmail`, `maskSnils`, `maskFullName` из
 * `common/logging/mask-pii.ts`), а не выбрасывается.
 */
const PII_NAMES = [
  'email',
  'recipientEmail',
  'snils',
  'passportNumber',
  'passportSeries',
  'fullName',
  'firstName',
  'lastName',
  'middleName',
  'birthDate',
  'phone'
];

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
 * Вызовы журналирования вместе с аргументами.
 *
 * **Здесь была дыра** (найдена ревизией 2026-08-26 проверкой мутацией). Разбор шёл строго
 * построчно, а форматтер регулярно переносит длинный аргумент на следующую строку:
 *
 * ```
 * this.logger.log(
 *   `Email ${id} resent to ${recipientEmail} …`   // ← эта строка в выборку НЕ попадала
 * );
 * ```
 *
 * То есть сторож видел `logger.log(` и не видел того, что в него передают. Комментарий на
 * этом месте уверял, что «имя секрета в аргументах видно и так» — оно видно не было.
 * Теперь берётся окно: строка вызова плюс следующие четыре, чего хватает на любой перенос,
 * который делает форматтер.
 */
const LOG_CALL = /(?:logger|console)\.(?:log|error|warn|debug|verbose)\(/;
const WINDOW_LINES = 4;

const loggingLines = (source: string): string[] => {
  const lines = source.split('\n');
  const windows: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!LOG_CALL.test(lines[i]!)) continue;
    windows.push(lines.slice(i, i + 1 + WINDOW_LINES).join(' '));
  }
  return windows;
};

describe('ФТ-G4 · секреты не попадают в журнал', () => {
  const files = collect(BACKEND_SRC);

  it('сканер видит код бэкенда', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('в журнал не пишется персональное значение без маскирования', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(BACKEND_SRC, file).split(sep).join('/');
      for (const line of loggingLines(readFileSync(file, 'utf8'))) {
        for (const name of PII_NAMES) {
          /* Ищем подстановку значения: `${...email}` или `{ email }`. */
          const interpolated = new RegExp(`\\$\\{[^}]*\\b${name}\\b`, 'i');
          const shorthand = new RegExp(`[{,]\\s*${name}\\s*[,}]`);
          if (!interpolated.test(line) && !shorthand.test(line)) continue;
          /* Маскирующие помощники — как раз то, ради чего правило и смягчено. */
          if (/mask(Email|Snils|FullName)\(/.test(line)) continue;
          offenders.push(`${rel}: ${line.trim().slice(0, 110)}`);
        }
      }
    }

    expect(
      offenders.sort(),
      'персональные данные в журнале: заверните значение в maskEmail / maskSnils / maskFullName — ' +
        'журналы читают шире, чем базу, и попадают в выгрузки и тикеты'
    ).toEqual([]);
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
