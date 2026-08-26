import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Обратная сторона правила «ни одного сырого идентификатора»: экран не должен ПОКАЗЫВАТЬ
 * идентификатор как значение.
 *
 * Слепая зона была ровно посередине. Сторож `id-input-ban` ловил поля «вставьте ID», но
 * колонку `render: (i) => i.learnerId` не видел никто. На обоих экранах очереди проверки
 * работ из-за этого преподаватель видел «Учащийся lrn_a3f9…», «Тест tst_71c…» — то есть на
 * своём основном экране не знал, чью работу проверяет (ревизия 2026-08-25, журнал 225).
 *
 * Ищем в колонках таблиц выражения вида `что-то.чтотоId`. Исключения — поля, которые лишь
 * НАЗЫВАЮТСЯ идентификатором, а на деле хранят введённый человеком текст.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];

const ID_RENDER = /render:\s*\([^)]*\)\s*=>\s*[^\n]*\.\w*(?:Id|ID)\b/g;

/*
 * Идентификатор внутри `.get(...)` или внутри вызова — это как раз ПЕРЕВОД его в название
 * (`moduleTitle.get(row.moduleId)`, `actorLabel(row.actorId)`). Не нарушение, а лекарство.
 */
const IS_LOOKUP = /(?:\.get\(|\w+\()\s*[\w.?]*\.\w*(?:Id|ID)\b/;

/** Поле → почему показывать его значение нормально. */
const NOT_REALLY_IDS: Record<string, string> = {
  organizationUnitId:
    'свободный текст: администратор вписывает название подразделения руками («Цех №3»), справочника подразделений в продукте нет'
};

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

describe('показ идентификатора вместо названия', () => {
  const offenders: string[] = [];
  for (const file of ROOTS.flatMap((root) => collect(root))) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(ID_RENDER)) {
      const field = /\.(\w*(?:Id|ID))\b/.exec(match[0])?.[1] ?? '';
      if (field in NOT_REALLY_IDS) continue;
      if (IS_LOOKUP.test(match[0])) continue;
      offenders.push(`${relative(APP_ROOT, file).replace(/\\/g, '/')}: ${match[0].trim()}`);
    }
  }

  it('ни одна колонка не печатает идентификатор как значение', () => {
    expect(
      offenders.sort(),
      'колонка показывает идентификатор — брать с сервера название или имя'
    ).toEqual([]);
  });

  it('у каждого исключения записано, почему это не идентификатор', () => {
    const withoutReason = Object.entries(NOT_REALLY_IDS)
      .filter(([, note]) => note.trim().length < 20)
      .map(([field]) => field);
    expect(withoutReason).toEqual([]);
  });
});
