import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { finishTestRequest } from '../features/test-player/finish-confirm';
import { finishSummary, unansweredNumbers } from '../features/test-player/finish-summary';

import type { AttemptQuestion } from '../features/test-player/types';

/**
 * Нельзя завершить тест вслепую (ТЗ «Стабилизация, UX и развитие», 6.4 / С4).
 *
 * **Как было.** Пролистать все вопросы, не ответив ни на один, и нажать «Завершить тест» было
 * можно. С задачи 5.3 диалог называл ЧИСЛО неотвеченных, но не говорил, КАКИЕ именно, и не давал
 * к ним вернуться (журнал 498). Про «попытка последняя» не говорилось вовсе — а это и делает
 * ошибку непоправимой (499).
 *
 * **Что закреплено.**
 *
 * 1. «Завершить тест» ведёт на СВОДКУ, а подтверждение вызывается только оттуда.
 * 2. Сводка называет, сколько отвечено, и перечисляет номера без ответа — с переходом к каждому.
 * 3. Последняя попытка названа прямо: и на сводке, и в диалоге подтверждения.
 * 4. Числа в диалоге берутся ИЗ сводки — разойтись им негде.
 */

const SCREEN = fromApp('src', 'features', 'test-player', 'test-attempt-screen.tsx');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

const question = (id: string): AttemptQuestion => ({
  id,
  type: 'single_choice',
  title: id,
  score: 1,
  options: []
});

const THREE = [question('q1'), question('q2'), question('q3')];
const ANSWERED_FIRST = { q1: { selectedOptionIds: ['o1'] } };

/** Тело выражения `{showSummary ? ( … )}` — по балансу фигурных скобок. */
const summaryBlock = (source: string): string => {
  const start = source.indexOf('{showSummary ? (');
  expect(start, 'на экране нет блока сводки').toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('блок сводки не закрыт');
};

const countOf = (source: string, needle: string): number => source.split(needle).length - 1;

describe('завершение теста требует сводки (ТЗ 6.4)', () => {
  it('подтверждение завершения вызывается ТОЛЬКО со сводки', () => {
    const screen = read(SCREEN);
    expect(screen, 'кнопка внизу открывает сводку').toContain('setShowSummary(true)');
    expect(countOf(screen, 'askFinish('), 'точка завершения на экране одна').toBe(1);
    expect(
      summaryBlock(screen),
      'единственный вызов подтверждения обязан жить внутри сводки'
    ).toContain('askFinish(');
  });

  it('сводка говорит, сколько отвечено, и называет пропущенные номера', () => {
    const summary = finishSummary({ questions: THREE, drafts: ANSWERED_FIRST });
    expect(summary.headline).toBe('Вы ответили на 1 из 3 вопросов');
    expect(summary.unanswered).toEqual([2, 3]);
    expect(summary.answered).toBe(1);
    expect(summary.total).toBe(3);

    expect(unansweredNumbers(THREE, {})).toEqual([1, 2, 3]);
    expect(
      unansweredNumbers(THREE, {
        q1: { textAnswer: 'да' },
        q2: { selectedOptionIds: ['o1'] },
        q3: { textAnswer: 'нет' }
      }),
      'когда отвечено всё, перечислять нечего'
    ).toEqual([]);
  });

  it('склонение числа вопросов человеческое', () => {
    expect(finishSummary({ questions: [question('q1')], drafts: {} }).headline).toBe(
      'Вы ответили на 0 из 1 вопроса'
    );
    expect(finishSummary({ questions: THREE, drafts: {} }).headline).toBe(
      'Вы ответили на 0 из 3 вопросов'
    );
  });

  it('с пропущенного номера можно вернуться к самому вопросу', () => {
    expect(
      /setCurrentIndex\(number - 1\)/.test(summaryBlock(read(SCREEN))),
      'номер в сводке — это переход к вопросу, а не просто цифра'
    ).toBe(true);
  });

  it('последняя попытка названа прямо — и на сводке, и в подтверждении', () => {
    const last = finishSummary({
      questions: THREE,
      drafts: ANSWERED_FIRST,
      attemptsUsed: 2,
      attemptLimit: 2
    });
    expect(last.lastAttempt).toBe(true);
    expect(last.lastAttemptWarning).toContain('последняя попытка');

    const notLast = finishSummary({
      questions: THREE,
      drafts: ANSWERED_FIRST,
      attemptsUsed: 1,
      attemptLimit: 3
    });
    expect(notLast.lastAttempt).toBe(false);
    expect(notLast.lastAttemptWarning, 'пугать раньше времени нельзя').toBe('');

    expect(finishTestRequest({ unanswered: 2, total: 3, lastAttempt: true }).message).toContain(
      'последняя попытка'
    );
    expect(
      finishTestRequest({ unanswered: 2, total: 3, lastAttempt: false }).message
    ).not.toContain('последняя попытка');

    expect(read(SCREEN), 'предупреждение показывается на сводке').toContain(
      'summary.lastAttemptWarning'
    );
  });

  it('неизвестный предел попыток не выдаётся за последнюю попытку', () => {
    // Предел попыток — настройка теста. Пока она не пришла, пугать человека нечем.
    expect(finishSummary({ questions: THREE, drafts: {} }).lastAttempt).toBe(false);
    expect(
      finishSummary({ questions: THREE, drafts: {}, attemptsUsed: 5, attemptLimit: 0 }).lastAttempt,
      'предел 0 означает «не задан», а не «попытки кончились»'
    ).toBe(false);
  });

  it('числа в подтверждении берутся из сводки — разойтись негде', () => {
    const block = summaryBlock(read(SCREEN));
    expect(block).toContain('unanswered: summary.unanswered.length');
    expect(block).toContain('total: summary.total');
    expect(block).toContain('lastAttempt: summary.lastAttempt');
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
    expect(plan).toContain('6.4');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Задача 3');
  });
});
