import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * Выбор записи из справочника делается общим компонентом `DirectorySelect`.
 *
 * Обычный `<select>` над справочником с сервера обманывает дважды (журнал 392):
 *
 * 1. Сервер отдаёт СТРАНИЦУ, а не всё. Центру с тремя сотнями слушателей список покажет
 *    двести (потолок запроса с проволоки, журнал 277) и промолчит об этом — человек решит,
 *    что остальных в системе нет. Поиска внутри списка нет, искать нечем.
 * 2. `<select>` с неизвестным значением молча показывает ПЕРВЫЙ пункт: уже выбранная
 *    запись, выпавшая из показанных, подменяется соседней.
 *
 * `DirectorySelect` закрывает оба: поиск уходит на СЕРВЕР, подсказка называет оба числа,
 * выбранная запись получает собственный пункт.
 *
 * **Почему храповик, а не запрет.** Пятнадцать таких списков живут на экранах, где выбор —
 * часть большой формы; перевод каждого требует своего состояния поиска и разбора того, что
 * на этом экране вообще значит «показано не всё». За один шаг это не делается, а запрет
 * «здесь и сейчас» заставил бы либо раздуть один PR до неразбираемого, либо ослабить
 * проверку. Список ниже сверяется НА РАВЕНСТВО: новый список в него не попадёт, а
 * переведённый обязан из него уйти.
 */

const FEATURES = fromApp('src', 'features');

/** Справочники — то, чего у центра бывает больше страницы. Статичные списки сюда не входят. */
const DIRECTORY_HOOKS =
  /use(?:Learners|Courses|Groups|Counterparties|Clients|QuestionBanks|Tests|Assignments)List\b/;

/**
 * Ещё не переведены. Число — сколько таких списков в файле.
 *
 * Список ведётся руками и должен сокращаться. Его длина — честная мера остатка: пока в нём
 * есть строки, обещание «выбор из справочника не врёт» выполнено не везде.
 */
const NOT_YET: Record<string, number> = {
  'analytics/screens.tsx': 2,
  'assessment/assessment-dashboard-screen.tsx': 3,
  'assessment-admin/test-question-picker.tsx': 1,
  'bulk-enrollments/bulk-import-screen.tsx': 1,
  'courses/courses-screens.tsx': 6,
  'groups/group-details-screen.tsx': 1,
  'recertification/approve-recert-modal.tsx': 1
};

const screens = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      screens(full, acc);
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) acc.push(full);
  }
  return acc;
};

/** `<select>…</select>`, внутри которого перебираются записи, пришедшие с сервера. */
const rawDirectorySelects = (code: string): number => {
  if (!DIRECTORY_HOOKS.test(code)) return 0;
  let count = 0;
  for (const block of code.matchAll(/<select\b[\s\S]*?<\/select>/g)) {
    if (/\.map\(/.test(block[0]) && /items/.test(block[0])) count += 1;
  }
  return count;
};

describe('выбор из справочника не врёт о том, что показывает', () => {
  it('список непереведённых сверяется на равенство', () => {
    const found: Record<string, number> = {};
    for (const file of screens(FEATURES)) {
      const count = rawDirectorySelects(stripComments(readFileSync(file, 'utf8')));
      if (count > 0) found[file.slice(FEATURES.length + 1)] = count;
    }

    expect(
      found,
      'слева — что найдено сейчас, справа — что записано в храповике. ' +
        'Появился новый список над справочником — переведите его на DirectorySelect; ' +
        'перевели существующий — уберите строку из NOT_YET.'
    ).toEqual(NOT_YET);
  });

  it('переведённые выборщики остаются переведёнными', () => {
    const converted = [
      'learners/learner-picker.tsx',
      'courses/course-picker.tsx',
      'groups/group-picker.tsx',
      'clients/group-counterparty-picker.tsx',
      'documents/entity-picker.tsx'
    ];
    const broken = converted.filter((relative) => {
      const code = stripComments(readFileSync(join(FEATURES, relative), 'utf8'));
      return rawDirectorySelects(code) > 0;
    });
    expect(broken, `выборщики, вернувшиеся к своему списку:\n${broken.join('\n')}`).toEqual([]);
  });
});
