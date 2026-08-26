import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Тело запроса проверяется, а не берётся на веру.
 *
 * Как выяснилось при ревизии 2026-08-26, общий проверяющий (`ValidationPipe`) молчит там,
 * где тело описано ИНТЕРФЕЙСОМ или литералом прямо в сигнатуре. Интерфейс при сборке
 * исчезает, в метаданных остаётся `Object`, а типы `Object` проверяющий пропускает. Это не
 * рассуждение: в собранном `dist/.../documents.controller.js` стоит
 * `__metadata("design:paramtypes", [Object, Object])`, тогда как ручки входа с классами-DTO
 * дают `[Object, LoginDto, …]`.
 *
 * То есть 44 ручки принимали что угодно — число вместо названия, `null` вместо
 * идентификатора, пачку в тысячу зачислений. Мусор уходил в домен: либо ошибка сервера
 * вместо понятного ответа, либо запись в документе, который центр выдаёт человеку.
 *
 * Ручка защищена, если выполнено одно из двух:
 *   - тело типизировано КЛАССОМ с декораторами `class-validator` (работает общий
 *     проверяющий — метаданные несут имя класса);
 *   - в теле обработчика вызван `assertValidDto` (работает всегда, даже там, где метаданных
 *     нет — например, под Vitest).
 *
 * Список ниже — ОЧЕРЕДЬ, а не разрешение: в ней то, что осталось с ревизии. Новая ручка с
 * непроверяемым телом валит этот тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');
const MODULES = join(SRC, 'modules');

/** Осталось с ревизии 2026-08-26. Чинить порциями; добавлять сюда новое — нельзя. */
const QUEUE = new Set([
  'communication/chat.controller.ts POST ',
  'communication/chat.controller.ts POST :id/messages',
  'documents/documents.controller.ts POST tenant-images/upload-url',
  'documents/documents.controller.ts PUT tenant-images/:slot',
  'documents/documents.controller.ts POST templates/upload-url',
  'documents/documents.controller.ts POST templates',
  'documents/documents.controller.ts PATCH templates/:id',
  'documents/documents.controller.ts POST templates/:id/set-current-version',
  'documents/documents.controller.ts POST template-versions',
  'documents/documents.controller.ts PATCH template-versions/:id',
  'documents/documents.controller.ts POST template-variables',
  'documents/documents.controller.ts PATCH template-variables/:id',
  'documents/documents.controller.ts POST template-bindings',
  'documents/documents.controller.ts PATCH template-bindings/:id',
  'documents/documents.controller.ts POST documents/generate/batch',
  'documents/documents.controller.ts POST job-quarantine/:id/discard',
  'documents/documents.controller.ts POST numbering-rules',
  'documents/documents.controller.ts PATCH numbering-rules/:id',
  'esign/esign.controller.ts POST applications',
  'esign/esign.controller.ts PATCH applications/:id',
  'esign/esign.controller.ts POST applications/:id/reject',
  'esign/esign.controller.ts POST application-files',
  'esign/esign.controller.ts POST application-files/:id/reject',
  'esign/esign.controller.ts POST processes',
  'esign/esign.controller.ts POST processes/:id/start',
  'esign/esign.controller.ts POST participants',
  'esign/esign.controller.ts PATCH participants/:id',
  'esign/esign.controller.ts POST participants/:id/sign',
  'esign/esign.controller.ts POST participants/:id/reject',
  'esign/esign.controller.ts POST participants/:id/skip',
  'integrations/webhooks/webhooks.controller.ts POST reprocess-failed',
  'migration/backfill/backfill.controller.ts POST runs',
  'migration/backfill/backfill.controller.ts POST runs/start',
  'mvp/mvp.controller.ts POST learners/:id/personal-data/erasure',
  'tenant/tenant.controller.ts PUT branding',
  'tenant/tenant.controller.ts PUT identity-settings'
]);

const VALIDATOR_DECORATOR =
  /@(IsString|IsInt|IsNumber|IsBoolean|IsArray|IsOptional|IsEnum|IsUUID|IsEmail|ValidateNested|MinLength|MaxLength|ArrayMaxSize|ArrayNotEmpty|Min|Max|Matches|IsDateString|IsIn|IsNotEmpty|IsObject)\b/;

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (full.endsWith('.ts') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Классы, которые общий проверяющий действительно проверит: класс + хотя бы один декоратор. */
const validatorClasses = (files: string[]): Set<string> => {
  const names = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(/export class (\w+)[\s\S]{0,4000}?(?=\nexport |\n}\n|$)/g)) {
      if (VALIDATOR_DECORATOR.test(match[0]!)) names.add(match[1]!);
    }
  }
  return names;
};

const scan = () => {
  const files = walk(SRC);
  const classes = validatorClasses(files);
  const unprotected: string[] = [];
  let withBody = 0;

  for (const file of files.filter((f) => f.endsWith('.controller.ts'))) {
    const rel = file.slice(MODULES.length + 1).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const route = /^\s*@(Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/.exec(lines[i]!);
      if (!route) continue;
      let end = i + 1;
      while (
        end < lines.length &&
        !/^\s*@(Get|Post|Put|Patch|Delete)\(/.test(lines[end]!) &&
        end < i + 60
      )
        end++;
      const body = lines.slice(i, end).join('\n');
      if (!/@Body\(/.test(body)) continue;
      withBody++;
      if (/assertValidDto/.test(body)) continue;

      const declared = /@Body\(\)\s*\w+\s*:\s*([A-Za-z_][\w.]*)/.exec(body);
      const typeName = declared?.[1];
      if (typeName && classes.has(typeName)) continue;
      /* Пустой класс-DTO — намеренная форма «тела нет» (например, refresh-маркер в куке). */
      if (typeName && /Dto$/.test(typeName)) continue;

      unprotected.push(`${rel} ${route[1]!.toUpperCase()} ${route[2] ?? ''}`);
    }
  }
  return { unprotected, withBody };
};

describe('тело запроса проверяется, а не берётся на веру', () => {
  const { unprotected, withBody } = scan();

  it('ручки с телом вообще найдены — иначе сторож зеленеет ни на чём', () => {
    expect(withBody).toBeGreaterThan(100);
  });

  it('новых ручек с непроверяемым телом не появилось', () => {
    const fresh = unprotected.filter((key) => !QUEUE.has(key)).sort();
    expect(
      fresh,
      'тело не проверяется: опишите его классом с декораторами class-validator ' +
        'или вызовите assertValidDto — интерфейс и литерал в сигнатуре проверяющий пропускает'
    ).toEqual([]);
  });

  it('очередь не врёт: исправленных мест в ней не осталось', () => {
    const fixed = [...QUEUE].filter((key) => !unprotected.includes(key)).sort();
    expect(fixed, 'ручка уже проверяет тело — уберите её из очереди').toEqual([]);
  });
});
