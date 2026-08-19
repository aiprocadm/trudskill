import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Конкретный маршрут не должен перехватываться параметризованным.
 *
 * Что это за беда простыми словами. NestJS перебирает маршруты в том порядке, в каком они
 * объявлены в классе. Если выше стоит `@Post(':providerCode')`, то запрос на
 * `/webhooks/reprocess-failed` попадёт именно в него — «reprocess-failed» будет принято за
 * код провайдера. Обработчик, ради которого писали код, не выполнится НИКОГДА.
 *
 * Так и было: переобработка неудачных вебхуков отвечала «неверная подпись» и выглядела как
 * проблема настройки, а на деле её обработчик был недостижим. Тесты этого не видели —
 * они дёргают методы класса напрямую, минуя маршрутизацию.
 *
 * Инвариант: для одного и того же HTTP-метода маршрут с параметром в первом сегменте не
 * должен стоять выше маршрута с тем же числом сегментов, у которого первый сегмент — слово.
 *
 * Проверено подсадным нарушителем: возврат обработчика ниже параметризованного роняет тест.
 */

const MODULES = resolve(dirname(fileURLToPath(import.meta.url)), '../../modules');
const ROUTE = /@(Get|Post|Put|Patch|Delete)\('([^']*)'\)/g;

const controllers = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...controllers(full));
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out;
};

interface Shadowed {
  file: string;
  greedy: string;
  hidden: string;
}

const findShadowed = (): Shadowed[] => {
  const problems: Shadowed[] = [];
  for (const file of controllers(MODULES)) {
    /*
     * Комментарии вырезаются ДО разбора. Иначе упоминание маршрута в пояснении (а такие
     * пояснения тут как раз и нужны — «объявлен выше намеренно») читается как настоящее
     * объявление, и проверка ругается на порядок, который на самом деле верный.
     * Ровно на этом сторож соврал при первом прогоне.
     */
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const routes = [...source.matchAll(ROUTE)].map((m) => ({
      method: m[1]!,
      path: m[2]!
    }));
    for (const [index, route] of routes.entries()) {
      const segments = route.path.split('/');
      if (!segments[0]?.startsWith(':')) continue;
      for (const later of routes.slice(index + 1)) {
        if (later.method !== route.method) continue;
        const laterSegments = later.path.split('/');
        if (laterSegments.length !== segments.length) continue;
        if (!laterSegments[0] || laterSegments[0].startsWith(':')) continue;
        problems.push({
          file: file
            .slice(MODULES.length + 1)
            .split(sep)
            .join('/'),
          greedy: `${route.method} '${route.path}'`,
          hidden: `${later.method} '${later.path}'`
        });
      }
    }
  }
  return problems;
};

describe('маршруты не перехватывают друг друга', () => {
  it('ни один конкретный маршрут не спрятан за параметризованным', () => {
    const shadowed = findShadowed().map(
      (p) => `${p.file}: ${p.greedy} перехватывает ${p.hidden} — объявите конкретный ВЫШЕ`
    );

    expect(
      shadowed,
      'Обработчик недостижим: до него запрос не дойдёт, потому что выше стоит маршрут ' +
        'с параметром в том же месте. Модульные тесты этого не поймают — они вызывают ' +
        'методы напрямую, минуя маршрутизацию. Переставьте конкретный маршрут выше.'
    ).toEqual([]);
  });

  it('проверка вообще что-то видит — иначе она бесполезна', () => {
    // Страховка от «пустого» обхода: контроллеры должны находиться и разбираться.
    const files = controllers(MODULES);
    expect(files.length).toBeGreaterThan(10);
    const withRoutes = files.filter((f) => ROUTE.test(readFileSync(f, 'utf8')));
    expect(withRoutes.length).toBeGreaterThan(10);
  });
});
