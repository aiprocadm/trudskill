import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import {
  answeredTotal,
  isAnswered,
  leaveExamRequest,
  questionHeading,
  questionMarks,
  questionStatement
} from '../features/test-player/exam-mode';

import type { AttemptQuestion } from '../features/test-player/types';

/**
 * Экзамен — отдельный режим, номер вопроса один (ТЗ «Стабилизация, UX и развитие», 6.2 / С2
 * и 6.3 / С3).
 *
 * **Как было.** Попытка шла в обычной оболочке: меню слева, поиск сверху, «Уведомления»,
 * переключатель темы и кнопка **«Выйти»** прямо над вопросами (495). Заголовок вопроса брал
 * номер из банка («Вопрос 3. Кто отвечает…»), а счётчик считал позицию в попытке («Вопрос 1
 * из 3») — два разных числа про один и тот же вопрос (496).
 *
 * **Что закреплено.**
 *
 * 1. Страница попытки рисуется БЕЗ общей оболочки, а сам режим сессию всё равно проверяет.
 * 2. Выход из режима есть, и он спрашивает подтверждение.
 * 3. Заголовок вопроса — только позиция в попытке; номер из банка снят.
 * 4. Есть карта вопросов с отметками «отвечен / пропущен».
 * 5. Отвеченные считает ОДНА функция — на карту, на диалог завершения и на подсказку возврата.
 */

const ATTEMPT_PAGE = fromApp(
  'app',
  'learner',
  'tests',
  '[testId]',
  'attempt',
  '[attemptId]',
  'page.tsx'
);
const FOCUS = fromApp('src', 'widgets', 'shell', 'focus-page.tsx');
const SCREEN = fromApp('src', 'features', 'test-player', 'test-attempt-screen.tsx');

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

const question = (id: string, title: string): AttemptQuestion => ({
  id,
  type: 'single_choice',
  title,
  score: 1,
  options: []
});

const THREE = [question('q1', 'Первый'), question('q2', 'Второй'), question('q3', 'Третий')];

describe('экзамен — отдельный режим (ТЗ 6.2, 6.3)', () => {
  it('страница попытки не рисуется в общей оболочке', () => {
    const page = read(ATTEMPT_PAGE);
    expect(page, 'оболочка приносит меню, поиск и «Выйти» над вопросами').not.toContain(
      '<ProtectedPage'
    );
    expect(page, 'экзамен рисуется своим режимом').toContain('<FocusPage');
  });

  it('режим экзамена проверяет сессию, но не тянет оболочку', () => {
    const focus = read(FOCUS);
    expect(focus, 'аноним на экзамен не попадает').toContain('<ProtectedRoute>');
    expect(focus, 'оболочки в режиме быть не должно').not.toContain('AppShell');
  });

  it('выход из режима есть и спрашивает подтверждение', () => {
    const screen = read(SCREEN);
    expect(
      /askLeave\(\s*leaveExamRequest\(/.test(screen),
      'выход обязан идти через подтверждение, а не молча уводить с экзамена'
    ).toBe(true);

    const request = leaveExamRequest({ answered: 2, total: 3 });
    expect(request.title).toBe('Выйти из теста');
    expect(request.confirmLabel).toBe('Выйти из теста');
    expect(request.cancelLabel).toBe('Остаться в тесте');
    expect(request.message, 'диалог называет, сколько уже отвечено').toContain('2 из 3');
  });

  it('заголовок вопроса — ТОЛЬКО позиция в попытке', () => {
    expect(questionHeading(0, 3)).toBe('Вопрос 1 из 3');
    expect(questionHeading(2, 3)).toBe('Вопрос 3 из 3');

    const screen = read(SCREEN);
    expect(
      /<SectionCard title=\{questionHeading\(/.test(screen),
      'заголовком карточки вопроса стоит счётчик'
    ).toBe(true);
    expect(screen, 'название из банка заголовком больше не ставится').not.toContain(
      'SectionCard title={q.title}'
    );
  });

  it('номер из банка вопросов снят с текста вопроса', () => {
    expect(questionStatement('Вопрос 3. Кто отвечает за инструктаж')).toBe(
      'Кто отвечает за инструктаж'
    );
    expect(questionStatement('Вопрос №3 — Кто отвечает')).toBe('Кто отвечает');
    expect(questionStatement('3) Кто отвечает')).toBe('Кто отвечает');
    // Название целиком состоит из номера — показывать нечего, счётчик уже всё сказал.
    expect(questionStatement('Вопрос 3')).toBe('');
    // Число внутри текста — часть вопроса, а не нумерация: трогать его нельзя.
    expect(questionStatement('Сколько длится инструктаж 2 раза в год?')).toBe(
      'Сколько длится инструктаж 2 раза в год?'
    );
    expect(read(SCREEN), 'экран показывает текст вопроса через снятие номера').toContain(
      'questionStatement(q.title)'
    );
  });

  it('карта вопросов показывает, что отвечено и что пропущено', () => {
    const marks = questionMarks(THREE, { q2: { selectedOptionIds: ['o1'] } }, 2);
    expect(marks.map((m) => m.number)).toEqual([1, 2, 3]);
    expect(marks.map((m) => m.answered)).toEqual([false, true, false]);
    expect(marks.map((m) => m.current)).toEqual([false, false, true]);
    expect(marks[0]?.label).toBe('Вопрос 1 — пропущен');
    expect(marks[1]?.label).toBe('Вопрос 2 — отвечен');

    const screen = read(SCREEN);
    expect(/questionMarks\(/.test(screen), 'карта строится на экране').toBe(true);
    expect(screen, 'у карты своя разметка').toContain('exam-map');
  });

  it('отвеченные считает одна функция — карта и диалог не разойдутся', () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered({ selectedOptionIds: [] })).toBe(false);
    expect(isAnswered({ textAnswer: '' })).toBe(false);
    expect(isAnswered({ textAnswer: 'да' })).toBe(true);
    expect(
      answeredTotal(THREE, { q1: { textAnswer: 'да' }, q3: { selectedOptionIds: ['o1'] } })
    ).toBe(2);

    const screen = read(SCREEN);
    expect(/answeredTotal\(/.test(screen), 'экран берёт счёт из общей функции').toBe(true);
    expect(screen, 'своего подсчёта на экране быть не должно').not.toContain(
      'Object.values(drafts).filter'
    );
  });

  it('план фазы 6 записан', () => {
    const plan = readFileSync(
      fromApp(
        '..',
        '..',
        'docs',
        'superpowers',
        'plans',
        '2026-09-18-stabux-phase-6-learner-cabinet.md'
      ),
      'utf8'
    );
    expect(plan).toContain('6.2');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Задача 2');
  });
});
