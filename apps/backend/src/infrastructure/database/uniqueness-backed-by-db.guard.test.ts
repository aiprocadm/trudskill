import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { errorThrows } from '../../common/testing/error-throw-inventory.test-util.js';

/**
 * Обещание «двух таких записей не будет» подперто БАЗОЙ, а не только проверкой в коде.
 *
 * Проверка «уже есть?» перед вставкой — это две операции, между которыми проходит время. Два
 * администратора центра, нажавшие «Добавить» одновременно, обе проверки проходят: ни одна ещё
 * не видит чужую запись. В обычном справочнике это неприятно, а в регулируемом реестре —
 * дефект отчётности: две лицензии с одним номером, два счёта с одним номером.
 *
 * Единственное, что делает обещание правдой, — ограничение в базе: оно проверяется в момент
 * записи, а не до неё. Проверка в коде остаётся: она даёт человеку внятный ответ вместо
 * ошибки базы. Но одна, без ограничения, она обещает то, чего не может.
 *
 * Инвариант: про каждый код-отказ «занято / уже есть» принято решение — либо названо
 * ограничение базы, которое его держит, либо записана причина, почему гонки нет.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(HERE, '..', '..', '..', 'migrations');
const SRC = resolve(HERE, '..', '..');

/** Коды отказа, которые обещают уникальность. */
const PROMISES_UNIQUENESS = /_taken$|_conflict$|_duplicate$|_already_exists$/;

type Rule = { table: string; columns: string[] } | { noRace: string };

/**
 * Обещания уникальности — и то, чем каждое держится.
 *
 * `table` + `columns` — ограничение базы, которое обязано существовать в миграциях.
 * `noRace` — причина, по которой гонки нет вовсе (её нужно объяснить, а не объявить).
 */
const RULES: Record<string, Rule> = {
  /* МГ-D2.1 (срез 14.1): табельный номер уникален у компании, когда задан (0116, РМ117). */
  employee_no_taken: {
    table: 'crm.counterparty_employees',
    columns: ['tenant_id', 'counterparty_id', 'employee_no']
  },
  tenant_code_taken: { table: 'core.tenants', columns: ['code'] },
  plan_code_taken: { table: 'core.plans', columns: ['code'] },
  library_code_taken: { table: 'core.platform_library_courses', columns: ['code'] },
  invoice_number_taken: { table: 'core.rental_invoices', columns: ['number'] },
  document_number_taken: {
    table: 'documents.number_reservations',
    columns: ['tenant_id', 'reserved_number']
  },
  duplicate_document_number: {
    table: 'documents.issued_number_claims',
    columns: ['tenant_id', 'reserved_number']
  },
  template_variable_code_taken: {
    table: 'documents.template_variables',
    columns: ['tenant_id', 'template_version_id', 'variable_code']
  },
  license_number_conflict: {
    table: 'org.training_licenses',
    columns: ['tenant_id', 'license_type', 'license_number']
  },
  commission_code_conflict: {
    noRace:
      'комиссии живут в снимке состояния центра: снимок пишется одной транзакцией с проверкой ' +
      'версии (`tenant_state_conflict`), поэтому вторая запись, начатая до первой, не ' +
      'сохранится — гонки проверки и вставки здесь нет'
  },
  tenant_state_conflict: {
    noRace:
      'это и ЕСТЬ проверка версии снимка состояния центра — механизм, который держит ' +
      'уникальность остальных коллекций, а не обещание поверх него'
  },
  proctoring_chunk_duplicate: {
    noRace:
      'куски видеозаписи нумерует один и тот же браузер по порядку; повтор означает ' +
      'переотправку того же куска, и ответ на него — «уже принят», а не запрет второй записи'
  },
  export_duplicate_recent: {
    noRace:
      'это защита от двойного нажатия («такая выгрузка собрана меньше минуты назад»), а не ' +
      'уникальность: две одинаковые выгрузки — законная запись, если между ними прошло время'
  }
};

/**
 * Второй вид обещания уникальности — БЕЗ кода отказа.
 *
 * Ревизия 2026-09-08 (журнал 356). Первая редакция этого сторожа искала обещания по кодам
 * (`*_taken`, `*_conflict`) — и не видела мест, где код не бросается вовсе: метод читает
 * таблицу, не находит записи и вставляет. Обещание там такое же («двух таких не будет»), а
 * держится оно ровно так же — только ограничением базы. Так и жил дубль участия в вебинаре:
 * два одновременных входа давали две строки, а по ним считают часы присутствия.
 *
 * Ключ — «метод читает ТУ ЖЕ таблицу, в которую потом вставляет».
 */
const CHECK_THEN_INSERT: Record<string, { table: string; columns: string[] } | { noRace: string }> =
  {
    'modules/communication/postgres-webinars.repository.ts upsertParticipantAttendance': {
      table: 'communication.webinar_participants',
      columns: ['tenant_id', 'webinar_id', 'learner_id']
    },
    'modules/iam/services/iam.service.ts findOrCreateByEmail': {
      table: 'iam.users',
      columns: ['tenant_id', 'email']
    },
    'modules/iam/services/iam.service.ts setUserRoles': {
      table: 'iam.user_roles',
      columns: ['tenant_id', 'user_id', 'role_id']
    },
    'modules/mvp/consents/postgres-consent.repository.ts insertDocument': {
      table: 'learning.consent_documents',
      columns: ['tenant_id', 'kind', 'version']
    },
    'modules/mvp/esignature/postgres-simple-signature.repository.ts insertAgreement': {
      table: 'learning.esignature_agreements',
      columns: ['tenant_id', 'version']
    },
    'modules/platform/platform-plans.service.ts createPlan': {
      table: 'core.plans',
      columns: ['code']
    },
    'modules/platform/platform-tenants.service.ts createTenant': {
      table: 'core.tenants',
      columns: ['code']
    },
    'modules/payments/postgres-payments.repository.ts createPayment': {
      noRace:
        'вставка идёт с `on conflict do nothing` по ключу оплаты — вторая попытка не создаёт ' +
        'строку, а тихо уступает первой; читающий запрос здесь только для ответа вызывающему'
    }
  };

/** Управляющие конструкции — не методы, хотя выглядят так же. */
const CONTROL_FLOW = new Set(['for', 'if', 'while', 'switch', 'catch', 'do']);

const sourcesUnder = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourcesUnder(full, acc);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.') && !entry.endsWith('.stub.ts')) {
      acc.push(full);
    }
  }
  return acc;
};

const blockAt = (source: string, open: number): string => {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return source.slice(open);
};

/** Методы, читающие ту же таблицу, в которую вставляют. */
const checkThenInsert = (): Array<{ key: string; location: string; table: string }> => {
  const found: Array<{ key: string; location: string; table: string }> = [];
  for (const file of sourcesUnder(SRC)) {
    const source = readFileSync(file, 'utf8');
    const relativeFile = relative(SRC, file).split('\\').join('/');
    for (const match of source.matchAll(
      /(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;]+)?\{/g
    )) {
      if (CONTROL_FLOW.has(match[1]!)) continue;
      const open = source.indexOf('{', match.index + match[0].length - 1);
      if (open === -1) continue;
      const body = blockAt(source, open);
      if (body.length > 20_000) continue;
      const read = /select[^`]*\bfrom\s+([a-z_]+\.[a-z_]+)/i.exec(body);
      const write = /insert\s+into\s+([a-z_]+\.[a-z_]+)/i.exec(body);
      if (!read || !write) continue;
      if (read[1]!.toLowerCase() !== write[1]!.toLowerCase()) continue;
      const line = source.slice(0, match.index).split('\n').length;
      found.push({
        key: `${relativeFile} ${match[1]}`,
        location: `${relativeFile}:${line}`,
        table: write[1]!
      });
    }
  }
  return found;
};

/**
 * Уникальность из миграций: `unique (…)`, `primary key (…)` и `create unique index`.
 *
 * Первичный ключ считается наравне с уникальным индексом — он держит ровно то же самое
 * (так устроен `documents.issued_number_claims`), и требовать рядом с ним ещё один индекс
 * значило бы требовать лишнего.
 */
const uniquenessInMigrations = (): Map<string, string[][]> => {
  const found = new Map<string, string[][]>();
  const remember = (table: string, columns: string[]) => {
    const key = table.toLowerCase();
    found.set(key, [...(found.get(key) ?? []), columns.map((c) => c.trim().toLowerCase())]);
  };

  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');

    for (const match of sql.matchAll(
      /create\s+unique\s+index[^;]*?\son\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)/gis
    )) {
      remember(match[1]!, match[2]!.split(','));
    }

    for (const table of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\n\)/gi
    )) {
      const name = table[1]!;
      for (const line of table[2]!.split('\n')) {
        const inlineUnique = /^\s*([a-z_]+)\s+[a-z()\s[\]]+\b(unique|primary\s+key)\b/i.exec(line);
        if (inlineUnique) {
          remember(name, [inlineUnique[1]!]);
          continue;
        }
        const composite = /\b(?:unique|primary\s+key)\s*\(([^)]*)\)/i.exec(line);
        if (composite) remember(name, composite[1]!.split(','));
      }
    }

    for (const match of sql.matchAll(
      /alter\s+table\s+([a-z_]+\.[a-z_]+)[^;]*?add\s+constraint[^;]*?unique\s*\(([^)]*)\)/gis
    )) {
      remember(match[1]!, match[2]!.split(','));
    }
  }
  return found;
};

const sameColumns = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

const unique = uniquenessInMigrations();
const readThenWrite = checkThenInsert();
const thrownCodes = new Set(errorThrows().flatMap((item) => item.codes));

describe('обещание уникальности подперто базой', () => {
  it('сторож видит миграции и коды, а не пустые списки', () => {
    expect(unique.size).toBeGreaterThanOrEqual(10);
    expect(thrownCodes.size).toBeGreaterThanOrEqual(150);
  });

  it('про каждый код «занято / уже есть» принято решение', () => {
    const undecided = [...thrownCodes]
      .filter((code) => PROMISES_UNIQUENESS.test(code))
      .filter((code) => !(code in RULES))
      .sort();
    expect(undecided, `обещаний без решения: ${undecided.length}`).toEqual([]);
  });

  it('у каждого названного ограничения есть миграция', () => {
    const missing = Object.entries(RULES)
      .filter(
        (entry): entry is [string, { table: string; columns: string[] }] => 'table' in entry[1]
      )
      .filter(([, rule]) => {
        const declared = unique.get(rule.table.toLowerCase()) ?? [];
        return !declared.some((columns) => sameColumns(columns, rule.columns));
      })
      .map(
        ([code, rule]) =>
          `${code} — обещает уникальность ${rule.table} (${rule.columns.join(', ')}), а такого ` +
          `ограничения в миграциях нет: проверка в коде не переживёт двух одновременных запросов`
      );
    expect(missing, `обещаний без опоры в базе: ${missing.length}`).toEqual([]);
  });

  it('список не протухает — записанный код всё ещё бросается', () => {
    const gone = Object.keys(RULES)
      .filter((code) => !thrownCodes.has(code))
      .map((code) => `${code} — записан в стороже, но бэкенд его больше не бросает`);
    expect(gone).toEqual([]);
  });

  it('«гонки нет» — это причина, а не отметка', () => {
    const thin = Object.entries(RULES)
      .filter((entry): entry is [string, { noRace: string }] => 'noRace' in entry[1])
      .filter(([, rule]) => rule.noRace.trim().length < 40)
      .map(([code]) => code);
    expect(thin).toEqual([]);
  });
  /*
   * Второй вид обещания — без кода отказа: метод читает таблицу и вставляет, если не нашёл.
   * Первая редакция сторожа его не видела, и дубль участия в вебинаре прожил незамеченным.
   */
  it('«проверил и вставил» тоже подперт базой', () => {
    const undecided = readThenWrite
      .filter((place) => !(place.key in CHECK_THEN_INSERT))
      .map((place) => `${place.location} — читает и вставляет ${place.table}, решения нет`);
    expect(undecided, `мест без решения: ${undecided.length}`).toEqual([]);

    const unbacked = readThenWrite
      .map((place) => [place, CHECK_THEN_INSERT[place.key]!] as const)
      .filter(
        (entry): entry is [(typeof readThenWrite)[number], { table: string; columns: string[] }] =>
          'table' in entry[1]
      )
      .filter(([, rule]) => {
        const declared = unique.get(rule.table.toLowerCase()) ?? [];
        return !declared.some((columns) => sameColumns(columns, rule.columns));
      })
      .map(
        ([place, rule]) =>
          `${place.location} — обещает уникальность ${rule.table} (${rule.columns.join(', ')}), ` +
          `а ограничения в миграциях нет`
      );
    expect(unbacked, `обещаний без опоры: ${unbacked.length}`).toEqual([]);
  });

  it('сторож видит «проверил и вставил» там, где это точно есть', () => {
    const files = new Set(readThenWrite.map((place) => place.key.split(' ')[0]!));
    for (const file of [
      'modules/communication/postgres-webinars.repository.ts',
      'modules/iam/services/iam.service.ts'
    ]) {
      expect(files.has(file), `«проверил и вставил» в ${file} не найден`).toBe(true);
    }
  });
});
