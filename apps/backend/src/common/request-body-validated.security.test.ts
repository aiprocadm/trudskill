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

/**
 * Ручки, которые проверяют вход НЕ классом, — с объяснением почему.
 *
 * Очередь ревизии 2026-08-26 разобрана до конца (порции 11–14): 44 места закрыты
 * проверяемыми классами. Осталось два, где проверка есть, но своя — доменная, и она
 * строже, чем дал бы класс. Переписывать их значило бы ослабить проверку ради
 * единообразия.
 *
 * Это НЕ очередь и НЕ разрешение: новая ручка без проверки валит тест. Чтобы попасть
 * сюда, нужна причина — как у этих двух.
 */
const ALLOWED: Record<string, string> = {
  'tenant/tenant.controller.ts PUT branding':
    'своя проверка `validateBrandingInput`: разбирает цвета и логотип и возвращает СПИСОК проблем — «#зелёненький» получает внятный отказ, а не общий «неверный формат»',
  'tenant/tenant.controller.ts PUT identity-settings':
    'своя проверка `isValidRetentionDays` с границами из настроек модуля; `null` там — намеренная форма «вернуть умолчание»'
};
const QUEUE = new Set(Object.keys(ALLOWED));
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

  it('список не врёт: ручек, уже проверяющих тело классом, в нём не осталось', () => {
    const fixed = [...QUEUE].filter((key) => !unprotected.includes(key)).sort();
    expect(fixed, 'ручка уже проверяет тело классом — уберите её из списка').toEqual([]);
  });

  it('у каждого исключения записана причина, а не отписка', () => {
    const vague = Object.entries(ALLOWED)
      .filter(([, why]) => why.trim().length < 30)
      .map(([key]) => key);
    expect(vague).toEqual([]);
  });
});
