import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';
import { courseHeaderAction } from '../features/courses/course-actions';
import { attemptsCaption } from '../features/test-player/format';

/**
 * Действие соответствует состоянию объекта (ТЗ «Стабилизация, UX и развитие», 5.2 / Э2).
 *
 * **Как было.** У опубликованного курса главная кнопка — «Опубликовать курс» (она смотрела на
 * права и структуру, но не на состояние; сервер публиковал опубликованное молча). В «Моих
 * тестах» — «Осталось попыток: 0 из 1» рядом с рабочей «Продолжить»: начатая попытка считалась
 * использованной, цифра говорила «всё», кнопка — «нет». В «Документах» у руководителя — пустая
 * колонка «Действия» во всю таблицу и кнопка «Создать шаблон» без права на бланки.
 *
 * **Что закреплено.** Кнопка отражает состояние; недоступное действие скрывается, а не
 * показывается вхолостую; возможность действия проверяет сервер, кнопка — отражение ответа.
 */

const COURSE_SCREEN = fromApp('src', 'features', 'courses', 'courses-screens.tsx');
const TESTS_LIST = fromApp('src', 'features', 'test-player', 'tests-list-screen.tsx');
const TEMPLATES = fromApp('src', 'features', 'documents', 'templates-section.tsx');
const DOCUMENTS = fromApp('src', 'features', 'documents', 'documents-screen.tsx');
const TABLE = fromPackages('ui', 'src', 'components', 'table', 'index.tsx');
const MVP_SERVICE = fromApp('..', 'backend', 'src', 'modules', 'mvp', 'mvp.service.ts');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

describe('действие соответствует состоянию объекта (ТЗ 5.2)', () => {
  it('карточка курса: главное действие выбирает состояние, а не права сами по себе', () => {
    const rights = { readyToPublish: true, canPublish: true, canCreateVersion: true };
    expect(courseHeaderAction({ status: 'published', ...rights })?.label).toBe(
      'Создать новую версию'
    );
    expect(courseHeaderAction({ status: 'draft', ...rights })?.label).toBe('Опубликовать курс');
    expect(courseHeaderAction({ status: 'archived', ...rights })).toBeNull();

    const screen = read(COURSE_SCREEN);
    expect(
      /headerAction = courseHeaderAction\(/.test(screen),
      'экран берёт действие из правила'
    ).toBe(true);
    expect(
      /label:\s*'Опубликовать курс'/.test(screen),
      'подпись кнопки написана в экране строкой — значит, она снова не смотрит на состояние'
    ).toBe(false);
    expect(
      /canArchiveCourse\(/.test(screen),
      '«В архив» — только у живого курса; архивировать архив нельзя'
    ).toBe(true);
  });

  it('список тестов: подпись про попытки говорит состоянием, а не цифрой «0 из 1»', () => {
    expect(attemptsCaption({ attemptsUsed: 1, attemptLimit: 1, activeAttemptId: 'a' })).toMatch(
      /продолжите/
    );
    const list = read(TESTS_LIST);
    expect(/attemptsCaption\(test\)/.test(list), 'экран подписывает попытки по состоянию').toBe(
      true
    );
    expect(/formatAttemptsLeft\(/.test(list), 'голая цифра мимо состояния').toBe(false);
    /* Кнопка: «Продолжить» только у начатой попытки; при исчерпанных — ничего. */
    expect(/test\.activeAttemptId \? \(/.test(list)).toBe(true);
    expect(/attemptsLeft > 0 \? \(/.test(list)).toBe(true);
  });

  it('таблица пакета не рисует пустую колонку «Действия»', () => {
    const table = read(TABLE);
    expect(
      /const showActions = rowActions !== undefined && rows\.some\(/.test(table),
      'колонка действий — только если действия есть хоть у одной строки'
    ).toBe(true);
  });

  it('создание шаблона — за правом, а не за одним лишь чтением', () => {
    const templates = read(TEMPLATES);
    expect(
      /canEditTemplates\s*\?\s*\{\s*emptyAction:/.test(templates),
      '«Создать первый шаблон» без права — действие вхолостую'
    ).toBe(true);
    const documents = read(DOCUMENTS);
    expect(
      /templates\.length > 0 && canEditTemplates/.test(documents),
      '«Создать шаблон» в шапке — только с правом documents.write'
    ).toBe(true);
  });

  it('сервер — источник правды: повторная публикация и повторный архив отказывают', () => {
    const service = read(MVP_SERVICE);
    const publishAt = service.indexOf('publishCourse(');
    const archiveAt = service.indexOf('archiveCourse(');
    expect(service.slice(publishAt, archiveAt)).toContain("code: 'course_not_draft'");
    expect(service.slice(archiveAt, archiveAt + 1200)).toContain("code: 'course_already_archived'");
    expect(service).toContain("code: 'attempt_limit_reached'");
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э2');
    expect(doc).toContain('`courseHeaderAction`');
    expect(doc).toContain('course_not_draft');
  });
});
