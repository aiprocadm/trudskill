import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Третий сторож семейства «объявлено — существует ли»: **контракт обещает ручку, и она есть.**
 *
 * `openapi.v1.json` — это обещание внешнему потребителю: вот адреса, вот ответы. Клиент,
 * написанный по контракту, к несуществующему адресу получит 404 и решит, что сломались мы.
 * Такое уже случалось: запись 264 журнала — «контракт обещает `GET /files/{id}/download`
 * (302 → объект хранилища), но маршрут никогда не существовал ни в одном контроллере».
 *
 * Здесь же нашлось второе (журнал 321): контракт объявлял `GET /health` с ответом
 * `HealthResponse`, а в контроллере были только `/health/live`, `/health/ready` и
 * `/health/startup`. Система наблюдения, настроенная по контракту, читала бы 404 как
 * «служба лежит» — про такой адрес обычно и настраивают проверку доступности.
 *
 * **Проверка односторонняя, и это осознанно.** Контракт покрывает 37 операций из ~495
 * маршрутов: он описывает канонический срез, а не всё подряд. Требовать обратного
 * («каждый маршрут описан в контракте») значило бы объявить дефектом 458 ручек разом —
 * это не находка, а шум. Вредна ровно одна сторона: обещание без исполнения.
 *
 * Проверено подсадным нарушителем: снятие `@Get()` с контроллера роняет тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES = resolve(HERE, '../../modules');
const OPENAPI = resolve(HERE, '../../../../../packages/api-contracts/src/openapi/openapi.v1.json');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface Operation {
  method: string;
  path: string;
}

/** Имя параметра значения не имеет: `{id}` и `{taskId}` — один и тот же адрес. */
const normalize = (path: string): string => path.replace(/\{[^}]+\}/g, '{x}');

const controllers = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...controllers(full));
      continue;
    }
    if (entry.endsWith('.controller.ts') && !entry.includes('.test.')) files.push(full);
  }
  return files;
};

/** Маршруты, которые бэкенд действительно обслуживает. */
const realRoutes = (): Set<string> => {
  const found = new Set<string>();
  for (const file of controllers(MODULES)) {
    const source = readFileSync(file, 'utf8');
    const base = /@Controller\(\s*'([^']*)'\s*\)/.exec(source)?.[1] ?? '';
    for (const match of source.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
      const method = (match[1] ?? '').toUpperCase();
      const tail = match[2] ?? '';
      const segments = [base.replace(/^\/|\/$/g, ''), tail.replace(/^\/|\/$/g, '')].filter(Boolean);
      const path = `/${segments.join('/')}`.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
      found.add(`${method} ${normalize(path === '/' ? '/' : path)}`);
    }
  }
  return found;
};

/** Операции, объявленные в контракте. */
const declaredOperations = (): Operation[] => {
  const spec = JSON.parse(readFileSync(OPENAPI, 'utf8')) as {
    paths?: Record<string, Record<string, unknown>>;
  };
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      if (item[method]) operations.push({ method: method.toUpperCase(), path });
    }
  }
  return operations;
};

describe('контракт обещает ручку — она существует', () => {
  it('у каждой операции контракта есть маршрут в коде', () => {
    const routes = realRoutes();
    const broken = declaredOperations()
      .map((op) => `${op.method} ${normalize(op.path)}`)
      .filter((op) => !routes.has(op))
      .sort();

    expect(
      broken,
      'Контракт объявляет операцию, которой нет ни в одном контроллере. Клиент, написанный ' +
        'по контракту, получит 404 и решит, что сломались мы. Либо заведите маршрут, либо ' +
        'уберите операцию из `openapi.v1.json` — обещание без исполнения хуже отсутствия ' +
        'обещания (журнал 264, 321).'
    ).toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустой список сделал бы проверку выше зелёной ни на чём.
    expect(declaredOperations().length).toBeGreaterThan(20);
    expect(realRoutes().size).toBeGreaterThan(100);
  });
});
