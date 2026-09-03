import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Десятый сторож семейства «объявлено — кто это исполняет»: **предел частоты, который
 * кто-то применяет.**
 *
 * `@Throttle({ limit, ttl })` сам по себе ничего не ограничивает — это запись «сколько можно»
 * в метаданных обработчика. Читает её только `ThrottlerGuard`, а глобального guard в
 * приложении нет: пределы навешиваются по-роутно, через `@UseGuards(ThrottlerGuard)` рядом.
 * Без него предел «спит»: написан, выглядит как защита, не действует.
 *
 * Проект на этом уже обжигался (§5.169): предел на публичной проверке документа спал с самого
 * рождения. Тогда починили ОДНО место и оставили предупреждение в комментарии — а сплошной
 * сверки не сделал никто. Так дожили до сегодняшнего дня оба публичных вебхука (журнал 334):
 * платежи и вебинары объявляли 60 запросов в минуту, а принимали сколько угодно — на ручках,
 * которые не требуют ни входа, ни арендатора, и на каждый запрос разбирают тело и ходят в базу.
 *
 * Инвариант: у каждого `@Throttle` есть `ThrottlerGuard` — на том же обработчике или на классе.
 * Если однажды guard станет глобальным (`APP_GUARD`), сторож увидит это в `app.module.ts` и
 * отойдёт: тогда его требование выполняется само.
 *
 * Проверено подсадным нарушителем: снятие `ThrottlerGuard` у любого `@Throttle` роняет тест и
 * называет обработчик.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');

const sources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sources(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.')) files.push(full);
  }
  return files;
};

/** Строка — часть декораторной обвязки, а не тела метода: `@…`, комментарий или закрывающая скобка. */
const DECORATOR_LINE = /^\s*(?:@|\/\/|\/?\*|[)}\]]+,?\s*$)/;
/** Сигнатура метода контроллера: `name(` или `async name(`; декораторы сюда не попадают. */
const METHOD_SIGNATURE =
  /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
const CLASS_LINE = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const HAS_THROTTLER_GUARD = /@UseGuards\([^)]*\bThrottlerGuard\b[^)]*\)/;

/** Глобальный `ThrottlerGuard` через `APP_GUARD` делает по-роутный лишним — тогда сторож молчит. */
const throttlerGuardIsGlobal = (): boolean => {
  const appModule = readFileSync(resolve(BACKEND_SRC, 'app.module.ts'), 'utf8');
  return /APP_GUARD[\s\S]{0,200}?\bThrottlerGuard\b/.test(appModule);
};

/** Обработчики с `@Throttle`, у которых нет `ThrottlerGuard` ни на методе, ни на классе. */
const sleepingThrottles = (): string[] => {
  const found: string[] = [];
  for (const file of sources(BACKEND_SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!/@Throttle\(/.test(text)) continue;
    const lines = text.split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*@Throttle\(/.test(lines[index] ?? '')) continue;

      // Обвязка обработчика: вверх до первой строки, которая не декоратор и не комментарий,
      // вниз — до сигнатуры метода.
      let start = index;
      while (start > 0 && DECORATOR_LINE.test(lines[start - 1] ?? '')) start -= 1;
      let end = index;
      while (end < lines.length - 1 && !METHOD_SIGNATURE.test(lines[end + 1] ?? '')) end += 1;
      const cluster = lines.slice(start, end + 1).join('\n');
      const method = METHOD_SIGNATURE.exec(lines[end + 1] ?? '')?.[1] ?? '<метод не найден>';

      // Обвязка класса: ближайший `class` выше и декораторы над ним.
      let classLine = start;
      while (classLine > 0 && !CLASS_LINE.test(lines[classLine] ?? '')) classLine -= 1;
      let classStart = classLine;
      while (classStart > 0 && DECORATOR_LINE.test(lines[classStart - 1] ?? '')) classStart -= 1;
      const classCluster = lines.slice(classStart, classLine).join('\n');
      const className = CLASS_LINE.exec(lines[classLine] ?? '')?.[1] ?? '<класс не найден>';

      if (HAS_THROTTLER_GUARD.test(cluster) || HAS_THROTTLER_GUARD.test(classCluster)) continue;
      found.push(`${file.slice(BACKEND_SRC.length + 1)}:${index + 1} ${className}.${method}`);
    }
  }
  return found.sort();
};

describe('предел частоты, который кто-то применяет', () => {
  it('у каждого @Throttle есть ThrottlerGuard на обработчике или на классе', () => {
    if (throttlerGuardIsGlobal()) return;
    expect(
      sleepingThrottles(),
      '`@Throttle` без `ThrottlerGuard` — это предел, который никто не проверяет: запись в ' +
        'метаданных есть, ограничения нет. Добавьте `@UseGuards(ThrottlerGuard)` к обработчику ' +
        '(или к классу). Именно так оба публичных вебхука объявляли 60 запросов в минуту и ' +
        'принимали сколько угодно (журнал 334; тот же класс — §5.169).'
    ).toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: если разбор сломается, список нарушителей опустеет и проверка
    // выше позеленеет ни на чём. `@Throttle` в проекте больше десятка — они обязаны находиться.
    const all = sources(BACKEND_SRC)
      .map((file) => (readFileSync(file, 'utf8').match(/^\s*@Throttle\(/gm) ?? []).length)
      .reduce((sum, count) => sum + count, 0);
    expect(all).toBeGreaterThanOrEqual(10);
  });
});
