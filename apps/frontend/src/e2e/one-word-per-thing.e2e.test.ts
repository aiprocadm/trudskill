import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Одно понятие — одно слово (`TXT-003` по смыслу).
 *
 * Состояние сущности подписывалось двумя словами сразу: 39 мест говорили «Статус»,
 * 32 — «Состояние». Разнобой завёл я сам в срезах 6–19, а канон задан ТЗ: в макете
 * шаблона реестра (§7.1) колонка и отбор называются **«Статус»**.
 *
 * Проверяется именно ПОДПИСЬ поля состояния — заголовок колонки, подпись фильтра,
 * строка сводки. Составные названия разделов («Состояние обмена», «Состояние очередей»)
 * — это имена блоков, а не подпись поля, и под правило не подпадают.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/** Подпись поля состояния: заголовок колонки, ярлык фильтра, строка сводки. */
const FORBIDDEN = [/title: 'Состояние'/, /label: 'Состояние'/, /ui-field-label">Состояние</];

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

describe('одно понятие — одно слово (TXT-003)', () => {
  const files = ROOTS.flatMap((root) => collect(root));

  it('сканер видит достаточно файлов — иначе зелёный ничего не значит', () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it('состояние сущности везде подписано словом «Статус»', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN.some((pattern) => pattern.test(source));
    });
    expect(
      offenders.map((file) => relative(APP_ROOT, file).replace(/\\/g, '/')),
      'подпись поля состояния — «Статус» (так в макете ТЗ §7.1), а не «Состояние»'
    ).toEqual([]);
  });

  it('канонное слово в приложении действительно используется', () => {
    // Защита от «зелено, потому что подписей не осталось вовсе».
    const withCanonical = files.filter((file) =>
      /title: 'Статус'/.test(readFileSync(file, 'utf8'))
    );
    expect(withCanonical.length).toBeGreaterThan(10);
  });
});
