import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Родственник `permission-coverage.isolation.test.ts`, только для окружения:
 *
 *   **переменная, объявленная в схеме, кем-то читается.**
 *
 * Переменная, которую не читает никто, — это ручка настройки, ничем не управляющая. Хуже
 * того, у схемы есть право ТРЕБОВАТЬ её: тогда эксплуатанту предписано положить в окружение
 * значение (иногда — боевой секрет) ради проверки, которая ничего не проверяет.
 *
 * Класс дал три находки за один заход (журнал 316–318):
 *   • `VAULT_ADDR`/`VAULT_TOKEN` требовались при `SECRETS_PROVIDER=vault`, а провайдер брал
 *     зеркалированные значения из `VAULT_SECRET_*` — адрес и токен не открывались ни разу;
 *   • документ утверждал, что `SECRETS_PROVIDER=env` в проде запрещён, тогда как код его
 *     разрешает, а рабочий пример прода им и пользуется;
 *   • `AUTH_PROVIDER` и четыре `SUPERTOKENS_*` не читал никто, при том что контейнер
 *     SuperTokens поднимался и в dev, и в БОЮ — со значением ключа по умолчанию.
 *
 * Проверено подсадным нарушителем: новый ключ в схеме без единого читателя роняет тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const SCHEMA = resolve(HERE, 'env.schema.ts');

/** Места, где переменную окружения читают: код служб и файлы развёртывания. */
const CONSUMER_ROOTS = [
  'apps/backend/src',
  'apps/worker/src',
  'apps/realtime/src',
  'apps/frontend/src',
  'packages',
  'infra',
  '.github',
  'package.json'
];

interface DeclaredElsewhere {
  key: string;
  why: string;
}

/**
 * Переменные, которых нет ни у одного читателя в этом репозитории, но которые объявлены
 * осознанно. Реестр решений, а не способ погасить красный тест: каждая строка отвечает,
 * ЗАЧЕМ переменная существует, если её никто не читает.
 */
const DECLARED_ELSEWHERE: ReadonlyArray<DeclaredElsewhere> = [];

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (/\.(ts|tsx|js|mjs|cjs|ya?ml|json|env|example|md)$|Caddyfile|Dockerfile/.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

/** Ключи `KEY: z.…` из объекта схемы. */
const declaredKeys = (): string[] => {
  const source = readFileSync(SCHEMA, 'utf8');
  const keys = new Set<string>();
  for (const match of source.matchAll(
    /^\s+([A-Z][A-Z0-9_]{2,}):\s*(?:z\.|loopback|boolean|deployment|secrets)/gm
  )) {
    if (match[1]) keys.add(match[1]);
  }
  return [...keys].sort();
};

/** Всё, что читают потребители, одним текстом — по нему и ищем упоминания. */
const consumerText = (): string => {
  const parts: string[] = [];
  for (const root of CONSUMER_ROOTS) {
    const full = resolve(REPO, root);
    if (!existsSync(full)) continue;
    const files = statSync(full).isDirectory() ? walk(full) : [full];
    for (const file of files) {
      if (file === SCHEMA) continue; // сама схема потребителем не считается
      if (/\.test\.tsx?$/.test(file)) continue; // тест — не потребитель настройки
      parts.push(readFileSync(file, 'utf8'));
    }
  }
  return parts.join('\n');
};

describe('переменная окружения объявлена — её кто-то читает', () => {
  it('у каждой объявленной переменной есть потребитель', () => {
    const text = consumerText();
    const explained = new Set(DECLARED_ELSEWHERE.map((item) => item.key));

    const orphans = declaredKeys().filter(
      (key) => !explained.has(key) && !new RegExp(`\\b${key}\\b`).test(text)
    );

    expect(
      orphans,
      'Переменная объявлена в схеме окружения, но её не читает НИКТО: ни код служб, ни ' +
        'compose, ни рабочие процессы CI. Такая настройка обещает управление и ничем не ' +
        'управляет; если схема её ещё и требует — эксплуатант кладёт значение ради ничего. ' +
        'Либо доведите до потребителя, либо уберите, либо внесите в DECLARED_ELSEWHERE ' +
        'с ответом, зачем она нужна.'
    ).toEqual([]);
  });

  it('реестр не устарел', () => {
    const declared = new Set(declaredKeys());
    const vanished = DECLARED_ELSEWHERE.filter((item) => !declared.has(item.key)).map((i) => i.key);
    expect(vanished, 'переменной больше нет в схеме — уберите строку из реестра').toEqual([]);

    const weak = DECLARED_ELSEWHERE.filter((item) => item.why.trim().length < 12).map((i) => i.key);
    expect(weak, 'запись без объяснения — это отложенный дефект, а не решение').toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустой список ключей или пустой текст потребителей
    // сделали бы проверку выше зелёной ни на чём.
    expect(declaredKeys().length).toBeGreaterThan(50);
    expect(consumerText().length).toBeGreaterThan(100_000);
  });
});
