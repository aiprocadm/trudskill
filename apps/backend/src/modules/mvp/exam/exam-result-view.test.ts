import { describe, expect, it } from 'vitest';

import {
  type ExamResultViewInput,
  type RetakeSourceAttempt,
  buildExamResultView,
  durationText,
  retakeTasks
} from './exam-result-view.js';
import { DEFAULT_EXAM_RETAKE_POLICY } from './retake-policy.js';

/**
 * Экран результата проверки знаний (ТЗ 10.4, пункт 5) и задача повторной проверки (пункт 2).
 *
 * **Главное, что здесь проверяется.** Экран отвечает на «что дальше», а не только на «что
 * было». Человек после неуда не должен решить, что потерял обучение целиком.
 */

const iso = (y: number, m: number, d: number, hh = 12, mm = 0): string =>
  new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();

const base: ExamResultViewInput = {
  purpose: 'final',
  passed: false,
  awaitingReview: false,
  attemptsUsed: 1,
  score: 12,
  maxScore: 20,
  passingScore: 16,
  startedAt: iso(2026, 9, 20, 10, 0),
  submittedAt: iso(2026, 9, 20, 10, 42),
  topicsWithErrors: ['Средства защиты', 'Работы на высоте'],
  policy: DEFAULT_EXAM_RETAKE_POLICY,
  now: new Date(2026, 8, 20, 14, 0, 0, 0)
};

describe('экран результата отвечает на «что дальше» (ТЗ 10.4, пункт 5)', () => {
  it('процент и проходной порог — в одной мере', () => {
    /*
     * «Набрано 12 из 20» человек сравнивает с порогом в уме и ошибается. Порог задан
     * процентом — значит и результат надо показывать процентом.
     */
    const view = buildExamResultView(base);
    expect(view.scorePercent).toBe(60);
    expect(view.passingPercent).toBe(80);
    expect(view.scoreLine).toBe('12 из 20');
  });

  it('процент округляется ВНИЗ', () => {
    /*
     * При округлении к ближайшему 79,6% превращается в 80%, и человек, не набравший порога,
     * видит на экране ровно пороговое число рядом со словами «не пройдено». Объяснить это
     * невозможно.
     */
    const view = buildExamResultView({ ...base, score: 199, maxScore: 250, passingScore: 200 });
    expect(view.scorePercent).toBe(79);
  });

  it('показано время прохождения', () => {
    expect(buildExamResultView(base).durationText).toBe('42 минуты');
  });

  it('сказано, что делать и до какого числа', () => {
    const view = buildExamResultView(base);
    expect(view.outcome).toBe('retake_required');
    expect(view.headline).toMatch(/повторная проверка/i);
    expect(view.nextStep).toContain('20 октября');
    expect(view.retakeDueText).toBe('20 октября');
    expect(view.retakeDaysLeft).toBe(30);
  });

  it('срок считается от дня СДАЧИ, а не от «сейчас»', () => {
    /*
     * Человек может открыть результат через неделю — срок от этого сдвигаться не должен,
     * иначе система сама себе продлевает установленные Порядком тридцать дней.
     */
    const view = buildExamResultView({ ...base, now: new Date(2026, 8, 27, 14, 0, 0, 0) });
    expect(view.retakeDueText).toBe('20 октября');
    expect(view.retakeDaysLeft).toBe(23);
  });

  it('названы темы, которые надо повторить', () => {
    expect(buildExamResultView(base).topicsToRevise).toEqual([
      'Средства защиты',
      'Работы на высоте'
    ]);
  });

  it('у сдавшего тем для повторения нет', () => {
    /* Список «что повторить» у сдавшего выглядит так, будто с результатом что-то не так. */
    expect(buildExamResultView({ ...base, passed: true }).topicsToRevise).toEqual([]);
  });

  it('разбор с правильными ответами у итоговой проверки не показывается (Р9, пункт 4)', () => {
    expect(buildExamResultView(base).showsAnswers).toBe(false);
    expect(buildExamResultView({ ...base, purpose: 'practice' }).showsAnswers).toBe(true);
  });

  it('у итоговой проверки одна попытка, и это видно', () => {
    const view = buildExamResultView(base);
    expect(view.attemptsUsed).toBe(1);
    expect(view.attemptsLeft).toBe(0);
  });

  it('у тренировки попытки не ограничены', () => {
    const view = buildExamResultView({ ...base, purpose: 'practice', attemptsUsed: 5 });
    expect(view.attemptsLeft).toBeNull();
    expect(view.outcome).toBe('can_try_again');
    expect(view.nextStep).toMatch(/не ограничен/i);
  });

  it('пока ответы на проверке, срока и приговора нет', () => {
    const view = buildExamResultView({ ...base, awaitingReview: true });
    expect(view.outcome).toBe('awaiting_review');
    expect(view.retakeDueAt).toBeUndefined();
    expect(view.headline).not.toMatch(/не пройден/i);
  });

  it('без даты сдачи срок не выдумывается', () => {
    /* Лучше сказать «дату назначит центр», чем показать срок, отсчитанный неизвестно откуда. */
    const view = buildExamResultView({ ...base, submittedAt: undefined as unknown as string });
    expect(view.retakeDueAt).toBeUndefined();
    expect(view.nextStep).toMatch(/центр/i);
  });
});

describe('время прохождения по-человечески', () => {
  it('меньше минуты названо словами, а не нулём', () => {
    /* «0 минут» человек читает как сбой. */
    expect(
      durationText(iso(2026, 9, 20, 10, 0), new Date(2026, 8, 20, 10, 0, 30).toISOString())
    ).toBe('меньше минуты');
  });

  it('часы и минуты', () => {
    expect(durationText(iso(2026, 9, 20, 10, 0), iso(2026, 9, 20, 11, 5))).toBe('1 час 5 минут');
    expect(durationText(iso(2026, 9, 20, 10, 0), iso(2026, 9, 20, 12, 0))).toBe('2 часа');
  });

  it('невозможная пара дат — лучше молчание, чем отрицательное время', () => {
    expect(durationText(iso(2026, 9, 20, 12, 0), iso(2026, 9, 20, 10, 0))).toBeUndefined();
    expect(durationText(undefined, iso(2026, 9, 20, 10, 0))).toBeUndefined();
  });
});

describe('повторная проверка знаний как задача центра (ТЗ 10.4, пункт 2)', () => {
  const now = new Date(2026, 8, 20, 12, 0, 0, 0);

  const attempt = (over: Partial<RetakeSourceAttempt> = {}): RetakeSourceAttempt => ({
    learnerId: 'l1',
    learnerName: 'Иванов Пётр',
    testId: 't1',
    testTitle: 'Охрана труда — итоговая',
    purpose: 'final',
    passed: false,
    awaitingReview: false,
    submittedAt: iso(2026, 9, 1, 10, 0),
    ...over
  });

  it('неуд на итоговой рождает задачу со сроком', () => {
    const tasks = retakeTasks([attempt()], DEFAULT_EXAM_RETAKE_POLICY, now);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.learnerName).toBe('Иванов Пётр');
    expect(new Date(tasks[0]!.dueAt).getDate()).toBe(1);
    expect(new Date(tasks[0]!.dueAt).getMonth()).toBe(9);
  });

  it('пересдавший исчезает из списка сам', () => {
    /*
     * Своего хранилища у задачи нет намеренно: отдельная таблица разошлась бы с
     * действительностью при первом же пропущенном событии, и центр работал бы по списку,
     * который врёт.
     */
    const tasks = retakeTasks(
      [attempt(), attempt({ passed: true, submittedAt: iso(2026, 9, 10, 10, 0) })],
      DEFAULT_EXAM_RETAKE_POLICY,
      now
    );
    expect(tasks).toEqual([]);
  });

  it('более ранняя УСПЕШНАЯ попытка не отменяет позднего неуда', () => {
    /* Иначе человек, сдавший однажды и заваливший пересдачу, пропадёт из виду. */
    const tasks = retakeTasks(
      [
        attempt({ passed: true, submittedAt: iso(2026, 9, 1, 10, 0) }),
        attempt({ passed: false, submittedAt: iso(2026, 9, 10, 10, 0) })
      ],
      DEFAULT_EXAM_RETAKE_POLICY,
      now
    );
    expect(tasks).toHaveLength(1);
  });

  it('ожидающая проверки попытка задачи не создаёт', () => {
    /* Результат ещё изменится: поставить срок сейчас — значит напугать зря. */
    expect(
      retakeTasks([attempt({ awaitingReview: true })], DEFAULT_EXAM_RETAKE_POLICY, now)
    ).toEqual([]);
  });

  it('тренировка и тест модуля в список не попадают', () => {
    /* Попав сюда, они утопили бы настоящие случаи. */
    expect(
      retakeTasks(
        [attempt({ purpose: 'practice' }), attempt({ purpose: 'module' })],
        DEFAULT_EXAM_RETAKE_POLICY,
        now
      )
    ).toEqual([]);
  });

  it('просроченное помечено и стоит первым', () => {
    const tasks = retakeTasks(
      [
        attempt({ learnerId: 'l2', testId: 't2', submittedAt: iso(2026, 9, 15, 10, 0) }),
        attempt({ learnerId: 'l3', testId: 't3', submittedAt: iso(2026, 8, 1, 10, 0) })
      ],
      DEFAULT_EXAM_RETAKE_POLICY,
      now
    );
    expect(tasks[0]!.learnerId).toBe('l3');
    expect(tasks[0]!.overdue).toBe(true);
    expect(tasks[1]!.overdue).toBe(false);
  });
});
