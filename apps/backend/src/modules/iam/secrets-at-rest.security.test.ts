import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `ФТ-G4` · секрет не лежит в базе открытым текстом.
 *
 * Политика в проекте отработана: пароли хранятся хешем, секреты интеграций — шифром
 * (`integrations.credentials.secret_encrypted` + `integration-crypto.service.ts`), токены
 * одноразового доступа — только хешем (`assessment.pre_exam_tokens.token_hash`).
 *
 * Но это была именно **практика**: ничто не мешало следующей миграции завести
 * `api_key text` рядом и пройти ревью незамеченной. Секрет в открытом виде опасен не сам
 * по себе, а тем, что утечка дампа базы превращается в утечку доступов к чужим системам —
 * и узнают об этом не сразу.
 *
 * Правило то же, что у реестра прав: колонка, похожая на секрет, либо хранится
 * защищённой, либо **перечислена ниже с ответом, почему она не секрет**.
 *
 * Разбор по тексту SQL, без базы: тест обязан работать в обычном прогоне, где PostgreSQL
 * нет. Он проверяет не «что лежит в живой базе», а «что миграция разрешает положить».
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', '..', '..', 'migrations');

/** Слова, после которых колонка выглядит секретом. */
const SECRET_WORDS = ['secret', 'password', 'token', 'api_key', 'apikey', 'private_key'];

/** Признаки защищённого хранения прямо в имени колонки. */
const PROTECTED_SUFFIX = ['_encrypted', '_hash', '_hashed'];

/**
 * Колонка → почему она не секрет. Пустая причина недопустима: «вроде безопасно» — это
 * не ответ, по которому можно принять решение на ревью.
 */
const NOT_A_SECRET: Record<string, string> = {
  qr_token:
    'публичный код проверки подлинности документа: он напечатан на бумажной копии и служит как номер — прятать его не от кого',
  password_migration_status:
    'состояние переезда учётки на новый способ входа («pending»), а не пароль',
  identity_verification_token_id:
    'ссылка на запись о подтверждении личности, сам токен лежит хешем в своей таблице',
  credential_id: 'ссылка на запись учётных данных интеграции, секрет хранится в ней шифром',
  supertokens_user_id:
    'идентификатор человека во внешней службе входа SuperTokens: слово «token» здесь часть названия продукта, а не секрет — по этому идентификатору войти нельзя'
};

interface Column {
  file: string;
  name: string;
}

/** Колонки, объявленные в миграциях: и в CREATE TABLE, и в ADD COLUMN. */
const declaredColumns = (): Column[] => {
  const out: Column[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    for (const line of sql.split('\n')) {
      const withoutComment = line.split('--')[0] ?? '';
      const trimmed = withoutComment.trim();
      if (!trimmed) continue;

      const added = trimmed.match(/add column(?: if not exists)?\s+([a-z_]+)\s/i);
      if (added) {
        out.push({ file, name: (added[1] as string).toLowerCase() });
        continue;
      }
      // Строка вида `  secret_encrypted text not null,` внутри CREATE TABLE.
      const plain = trimmed.match(/^([a-z_]+)\s+(text|varchar|citext)\b/i);
      if (plain) out.push({ file, name: (plain[1] as string).toLowerCase() });
    }
  }
  return out;
};

const looksLikeSecret = (name: string): boolean =>
  SECRET_WORDS.some((word) => name.includes(word)) &&
  !PROTECTED_SUFFIX.some((suffix) => name.endsWith(suffix));

describe('ФТ-G4 · секреты не хранятся открытым текстом', () => {
  const columns = declaredColumns();

  it('разбор миграций видит колонки — иначе тест зелёный по пустоте', () => {
    expect(columns.length).toBeGreaterThan(50);
    // Защищённые колонки существуют: значит признак `_encrypted`/`_hash` не выдуман.
    expect(columns.some((column) => column.name.endsWith('_encrypted'))).toBe(true);
    expect(columns.some((column) => column.name.endsWith('_hash'))).toBe(true);
  });

  it('колонка, похожая на секрет, либо защищена, либо объяснена', () => {
    const unexplained = columns
      .filter((column) => looksLikeSecret(column.name))
      .filter((column) => !(column.name in NOT_A_SECRET))
      .map((column) => `${column.file}: ${column.name}`);

    expect(
      unexplained,
      `эти колонки выглядят секретом и хранятся открытым текстом:\n${unexplained.join('\n')}\n` +
        'Храните хешем (`*_hash`) или шифром (`*_encrypted`) — либо объясните в NOT_A_SECRET, ' +
        'почему это не секрет. Утечка дампа базы не должна становиться утечкой чужих доступов.'
    ).toEqual([]);
  });

  it('в списке исключений нет колонок, которых больше нет', () => {
    const known = new Set(columns.map((column) => column.name));
    const stale = Object.keys(NOT_A_SECRET).filter((name) => !known.has(name));

    expect(stale, `колонка исчезла — вычеркните её:\n${stale.join('\n')}`).toEqual([]);
  });

  it('у каждого исключения есть причина словами, а не отписка', () => {
    for (const [name, reason] of Object.entries(NOT_A_SECRET)) {
      expect(reason.length, `объяснение для ${name} слишком короткое`).toBeGreaterThan(30);
    }
  });
});
