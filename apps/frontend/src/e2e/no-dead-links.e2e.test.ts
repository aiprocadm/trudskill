import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { routeMeta } from '../features/navigation/model';

/**
 * Ссылка внутри экрана ведёт на существующий маршрут.
 *
 * `ia-architecture` стережёт **меню**: каждый его пункт ведёт на живую страницу. Но
 * ссылки, написанные прямо в экранах, не проверял никто — и ревизия нашла тупик: в
 * карточке заказчика ссылка «Перейти к списку групп» вела на `/admin/groups`, которого
 * не существует. Человек нажимал и попадал на «страница не найдена».
 *
 * Такую ошибку не видно ни на ревью (адрес выглядит правдоподобно), ни в тестах экрана
 * (ссылка рисуется, значит «работает»). Видно её только тому, кто нажал.
 *
 * Сторож собирает адреса из четырёх мест, где они пишутся: `href="…"`, `href={`/…`}`,
 * `router.push('/…')` и `href: '/…'` в данных. Внешние адреса и якоря пропускаются.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (!full.endsWith('.tsx') && !full.endsWith('.ts')) continue;
    if (full.includes('.test.')) continue;
    acc.push(full);
  }
  return acc;
};

/** Адреса, написанные в исходнике: строкой, шаблоном или переходом кодом. */
const hrefsOf = (source: string): string[] => {
  const out: string[] = [];
  const push = (value: string | undefined) => {
    if (!value) return;
    const clean = value.split('?')[0]?.replace(/\/$/, '') ?? '';
    if (clean.startsWith('/')) out.push(clean);
  };

  for (const m of source.matchAll(/href=(?:"([^"{}]+)"|\{'([^']+)'\})/g)) push(m[1] ?? m[2]);
  // Шаблон: берём часть до первой подстановки — `/groups/${id}` → `/groups`.
  for (const m of source.matchAll(/href=\{`(\/[^`$]*)/g)) push(m[1]);
  for (const m of source.matchAll(/router\.(?:push|replace)\((?:'([^']+)'|`(\/[^`$]*))/g)) {
    push(m[1] ?? m[2]);
  }
  for (const m of source.matchAll(/href:\s*'(\/[^']*)'/g)) push(m[1]);
  return out;
};

const KNOWN = routeMeta.map((entry) => entry.pattern);

/** Адрес известен, если он сам маршрут или лежит внутри маршрута (`/groups/123`). */
const isKnown = (href: string): boolean =>
  href === '/' ||
  KNOWN.some((pattern) => href === pattern || (pattern !== '/' && href.startsWith(`${pattern}/`)));

describe('ссылки внутри экранов не ведут в тупик', () => {
  const files = collect(join(FRONTEND, 'src')).concat(collect(join(FRONTEND, 'app')));

  it('сторож видит и экраны, и карту маршрутов', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(KNOWN.length).toBeGreaterThan(50);
  });

  it('каждый адрес из экрана есть в карте доступа', () => {
    const dead: string[] = [];

    for (const file of files) {
      const rel = relative(FRONTEND, file).split(sep).join('/');
      for (const href of new Set(hrefsOf(readFileSync(file, 'utf8')))) {
        if (!isKnown(href)) dead.push(`${href} ← ${rel}`);
      }
    }

    expect(
      dead,
      `эти ссылки ведут на несуществующие страницы:\n${dead.join('\n')}\n` +
        'Человек нажмёт и попадёт на «страница не найдена». Проверьте адрес по ' +
        'features/navigation/model.ts — или добавьте маршрут, если раздел действительно нужен.'
    ).toEqual([]);
  });
});
