import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { programMetaView } from '../features/courses/program-meta-view';

import type { CourseVersion } from '../features/mvp/types';

/**
 * Режим «только просмотр» виден (ТЗ «Стабилизация, UX и развитие», 5.10 / Э10).
 *
 * **Как было.** У опубликованной версии курса над формой стояла надпись «Версия опубликована —
 * параметры доступны только для просмотра», а под ней — одиннадцать обычных на вид полей ввода,
 * просто выключенных. Человек видел поле «Часы (академические)» со значением 16, щёлкал в него
 * и не понимал, почему не печатается (журнал 472). Надпись объясняла, но её читают не раньше,
 * чем упрутся.
 *
 * **Что закреплено.**
 *
 * 1. В режиме просмотра значения выводятся ТЕКСТОМ (`KeyValueList`), а не полями ввода.
 * 2. Ни одного `disabled={readOnly}`: выключенное поле ввода — это и есть «выглядит как поле».
 * 3. Рядом — путь к правке: «Создать новую версию, чтобы изменить».
 * 4. Подписи значений — ОДИН источник и для формы, и для просмотра.
 * 5. Пустое значение называется словами («Не задано»), коды переводятся в имена.
 */

const SCREEN = fromApp('src', 'features', 'courses', 'courses-screens.tsx');
const VIEW = fromApp('src', 'features', 'courses', 'program-meta-view.ts');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/** Тело `if (readOnly) { … }` — по балансу фигурных скобок. */
const readOnlyBranch = (source: string): string => {
  const at = source.indexOf('if (readOnly) {');
  if (at === -1) return '';
  let depth = 0;
  let j = source.indexOf('{', at);
  for (let i = j; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        j = i;
        break;
      }
    }
  }
  return source.slice(at, j + 1);
};

const version = (over: Partial<CourseVersion> = {}): CourseVersion =>
  ({
    id: 'cv1',
    courseId: 'c1',
    version: 1,
    status: 'published',
    ...over
  }) as CourseVersion;

const EMPTY = { acts: new Map(), otPrograms: new Map(), commissions: new Map() };

describe('режим «только просмотр» виден (ТЗ 5.10)', () => {
  it('в режиме просмотра нет ни одного поля ввода', () => {
    const branch = readOnlyBranch(read(SCREEN));
    expect(branch, 'ветка просмотра обязана существовать').not.toBe('');
    expect(/<input\b/.test(branch), 'выключенное поле всё равно выглядит полем').toBe(false);
    expect(/<select\b/.test(branch)).toBe(false);
    expect(branch, 'значения выводятся текстом').toContain('<KeyValueList');
  });

  it('из просмотра виден путь к правке', () => {
    expect(readOnlyBranch(read(SCREEN))).toContain('Создать новую версию, чтобы изменить');
  });

  it('`disabled={readOnly}` не осталось нигде', () => {
    /*
     * Главный признак прежнего поведения. Проверяется весь экран, а не только ветка:
     * форма и просмотр теперь разные ветки, и выключенным полям не место ни в одной.
     */
    const count = (read(SCREEN).match(/disabled=\{readOnly\}/g) ?? []).length;
    expect(count, 'поле ввода в режиме просмотра — это и есть дефект ТЗ 5.10').toBe(0);
  });

  it('подписи значений — один источник для формы и для просмотра', () => {
    const screen = read(SCREEN);
    // Два независимых списка разошлись бы, и вид подготовки назывался бы по-разному.
    expect(screen).toContain("from './program-meta-view'");
    expect(
      /const TRAINING_TYPE_OPTIONS/.test(screen),
      'список подписей объявлен на экране заново'
    ).toBe(false);
  });

  it('незаполненное поле называется словами, а не пустой ячейкой', () => {
    const rows = programMetaView(version(), EMPTY);
    const hours = rows.find((row) => row.label === 'Часы (академические)');
    expect(hours?.value, 'пустая ячейка читается как сбой загрузки').toBe('Не задано');
    expect(rows.every((row) => row.value.trim().length > 0)).toBe(true);
  });

  it('коды переводятся в имена, а не показываются как есть', () => {
    const rows = programMetaView(
      version({ regulatoryBasisCodes: ['tk-214'], commissionId: 'cm1' }),
      {
        acts: new Map([['tk-214', 'ТК РФ ст. 214']]),
        otPrograms: new Map(),
        commissions: new Map([['cm1', 'К-1 — Основная комиссия']])
      }
    );
    expect(rows.find((row) => row.label === 'Нормативные акты')?.value).toBe('ТК РФ ст. 214');
    expect(rows.find((row) => row.label === 'Аттестационная комиссия')?.value).toBe(
      'К-1 — Основная комиссия'
    );
  });

  it('признаки-выключатели отвечают действием, а не «да/нет»', () => {
    // «Перемотка при первом просмотре: Да» читается наоборот — разрешена она или запрещена?
    const strict = programMetaView(version({ noSeekOnFirstView: true }), EMPTY);
    expect(strict.find((row) => row.label === 'Перемотка при первом просмотре')?.value).toBe(
      'Запрещена'
    );
    const free = programMetaView(version({ noSeekOnFirstView: false }), EMPTY);
    expect(free.find((row) => row.label === 'Перемотка при первом просмотре')?.value).toBe(
      'Разрешена'
    );
  });

  it('значения показываются в тех же единицах, что и вводятся', () => {
    const rows = programMetaView(version({ videoCompletionPercent: 90, academicHours: 16 }), EMPTY);
    expect(rows.find((row) => row.label === 'Зачёт видео-урока')?.value).toBe('90% просмотра');
    expect(rows.find((row) => row.label === 'Часы (академические)')?.value).toBe('16');
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э10');
    expect(doc).toContain('KeyValueList');
  });

  it('сторож читает настоящий файл экрана, а не пустоту', () => {
    expect(read(VIEW).length).toBeGreaterThan(500);
    expect(read(SCREEN).length).toBeGreaterThan(5000);
  });
});
