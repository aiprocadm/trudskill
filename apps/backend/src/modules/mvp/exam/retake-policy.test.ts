import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXAM_RETAKE_POLICY,
  EXAM_PURPOSE_LABELS,
  attemptLimitFor,
  daysUntil,
  examOutcome,
  formatDueDate,
  nextStepText,
  outcomeHeadline,
  resolveExamRetakePolicy,
  retakeDueAt,
  showsAnswerReview
} from './retake-policy.js';

/**
 * Правила попыток и пересдач (ТЗ 10.4, решение Р9, пункт 79 Порядка № 2464).
 *
 * **Что здесь на самом деле проверяется.** Не арифметика, а то, что неудовлетворительный
 * результат НЕ «сжигает» слушателя, а рождает задачу со сроком. Ошибка в эту сторону
 * незаметна и дорога: человек видит «не пройдено», решает, что потерял обучение, и уходит.
 */

const at = (y: number, m: number, d: number, hh = 12): Date => new Date(y, m - 1, d, hh, 0, 0, 0);

describe('сколько попыток у проверки (Р9, пункт 1)', () => {
  it('у итоговой проверки — одна', () => {
    expect(attemptLimitFor('final', DEFAULT_EXAM_RETAKE_POLICY)).toBe(1);
  });

  it('правило теста НЕ может дать итоговой проверке больше попыток', () => {
    /*
     * Иначе решение Р9 обходится галочкой в карточке теста, и «одна попытка» держится на
     * том, что все методисты помнят про Порядок.
     */
    expect(attemptLimitFor('final', DEFAULT_EXAM_RETAKE_POLICY, 5)).toBe(1);
  });

  it('у тренировочного тестирования ограничения нет вовсе', () => {
    /* Оно для того и заведено, чтобы человек пробовал сколько нужно (Р9, пункт 3). */
    expect(attemptLimitFor('practice', DEFAULT_EXAM_RETAKE_POLICY, 3)).toBeNull();
  });

  it('у теста модуля число попыток задаёт методист', () => {
    expect(attemptLimitFor('module', DEFAULT_EXAM_RETAKE_POLICY, 3)).toBe(3);
  });
});

describe('число попыток и срок — настройки, а не числа в коде', () => {
  it('умолчания взяты из Порядка № 2464', () => {
    expect(DEFAULT_EXAM_RETAKE_POLICY.finalAttemptLimit).toBe(1);
    expect(DEFAULT_EXAM_RETAKE_POLICY.retakeWindowDays).toBe(30);
  });

  it('центр может изменить настройку, и она действует', () => {
    const policy = resolveExamRetakePolicy({ finalAttemptLimit: 2, retakeWindowDays: 14 });
    expect(attemptLimitFor('final', policy)).toBe(2);
    expect(retakeDueAt(at(2026, 9, 1), policy).getDate()).toBe(15);
  });

  it('непонятное значение — это умолчание, а не «без ограничений»', () => {
    /* Опечатка в настройке не должна молча превращать итоговую проверку в тренировку. */
    const policy = resolveExamRetakePolicy({ finalAttemptLimit: 'много', retakeWindowDays: null });
    expect(policy.finalAttemptLimit).toBe(1);
    expect(policy.retakeWindowDays).toBe(30);
  });

  it('значения приводятся к допустимым', () => {
    expect(resolveExamRetakePolicy({ finalAttemptLimit: 0 }).finalAttemptLimit).toBe(1);
    expect(resolveExamRetakePolicy({ finalAttemptLimit: 999 }).finalAttemptLimit).toBe(10);
    expect(resolveExamRetakePolicy({ retakeWindowDays: 0 }).retakeWindowDays).toBe(1);
    expect(resolveExamRetakePolicy({ retakeWindowDays: 5000 }).retakeWindowDays).toBe(365);
  });

  it('пустая настройка центра — умолчания', () => {
    expect(resolveExamRetakePolicy(undefined)).toEqual(DEFAULT_EXAM_RETAKE_POLICY);
    expect(resolveExamRetakePolicy(null)).toEqual(DEFAULT_EXAM_RETAKE_POLICY);
  });
});

describe('неуд не «сжигает» слушателя (Р9, пункт 2)', () => {
  it('неуд на итоговой — это ТРЕБОВАНИЕ повторной проверки, а не конец', () => {
    expect(
      examOutcome({
        purpose: 'final',
        passed: false,
        awaitingReview: false,
        attemptsUsed: 1,
        attemptLimit: 1
      })
    ).toBe('retake_required');
  });

  it('пока развёрнутые ответы не проверены, «не сдал» не говорим', () => {
    /*
     * Результат ещё изменится, а слушатель уже расстроен и звонит в центр. Порядок проверок
     * здесь важнее самих проверок.
     */
    expect(
      examOutcome({
        purpose: 'final',
        passed: false,
        awaitingReview: true,
        attemptsUsed: 1,
        attemptLimit: 1
      })
    ).toBe('awaiting_review');
  });

  it('тренировку можно проходить снова', () => {
    expect(
      examOutcome({
        purpose: 'practice',
        passed: false,
        awaitingReview: false,
        attemptsUsed: 7,
        attemptLimit: null
      })
    ).toBe('can_try_again');
  });

  it('у теста модуля попытки кончаются — тогда тоже нужна повторная проверка', () => {
    /* Пока попытки есть — можно пробовать; кончились — дальше решает центр, а не система. */
    expect(
      examOutcome({
        purpose: 'module',
        passed: false,
        awaitingReview: false,
        attemptsUsed: 1,
        attemptLimit: 3
      })
    ).toBe('can_try_again');
    expect(
      examOutcome({
        purpose: 'module',
        passed: false,
        awaitingReview: false,
        attemptsUsed: 3,
        attemptLimit: 3
      })
    ).toBe('retake_required');
  });
});

describe('срок повторной проверки (пункт 79 Порядка)', () => {
  it('тридцать календарных дней со дня проверки', () => {
    expect(retakeDueAt(at(2026, 9, 20), DEFAULT_EXAM_RETAKE_POLICY).getTime()).toBe(
      at(2026, 10, 20, 0).getTime()
    );
  });

  it('срок — это ДЕНЬ, а не момент', () => {
    /* «До 20 октября» не значит «до 14:37 20 октября»: человек читает это как весь день. */
    const due = retakeDueAt(at(2026, 9, 20, 14), DEFAULT_EXAM_RETAKE_POLICY);
    expect(due.getHours()).toBe(0);
    expect(due.getMinutes()).toBe(0);
  });

  it('месяцы и годы переходятся правильно', () => {
    expect(retakeDueAt(at(2026, 12, 20), DEFAULT_EXAM_RETAKE_POLICY).getFullYear()).toBe(2027);
    expect(retakeDueAt(at(2026, 12, 20), DEFAULT_EXAM_RETAKE_POLICY).getMonth()).toBe(0);
    expect(retakeDueAt(at(2026, 12, 20), DEFAULT_EXAM_RETAKE_POLICY).getDate()).toBe(19);
  });

  it('дни до срока считаются по дням, а не по часам', () => {
    /*
     * Иначе «осталось 0 дней» появляется за час до полуночи предыдущего дня, и человек
     * решает, что опоздал.
     */
    expect(daysUntil(at(2026, 9, 21, 0), at(2026, 9, 20, 23))).toBe(1);
    expect(daysUntil(at(2026, 9, 20, 0), at(2026, 9, 20, 23))).toBe(0);
    expect(daysUntil(at(2026, 9, 18, 0), at(2026, 9, 20, 1))).toBe(-2);
  });

  it('дата пишется словами', () => {
    expect(formatDueDate(at(2026, 10, 20))).toBe('20 октября');
  });
});

describe('что человек прочитает (ТЗ 10.4, пункт 5)', () => {
  it('заголовок называет исход, а не действие', () => {
    expect(outcomeHeadline('passed')).toMatch(/пройдена/i);
    expect(outcomeHeadline('retake_required')).toMatch(/повторная проверка/i);
    expect(outcomeHeadline('awaiting_review')).toMatch(/проверке/i);
  });

  it('при неуде сказано, что делать и до какого числа', () => {
    const text = nextStepText('retake_required', {
      dueAt: at(2026, 10, 20),
      now: at(2026, 9, 20)
    });
    expect(text).toContain('повторная проверка знаний');
    expect(text).toContain('20 октября');
    expect(text).toMatch(/осталось\s+30/i);
  });

  it('про протокол сказано прямо, а не умолчано', () => {
    /*
     * Результат идёт в протокол и в реестр обученных лиц в любом случае (Р9, пункт 1). Если
     * умолчать, человек узнает об этом от работодателя и решит, что его обманули.
     */
    expect(
      nextStepText('retake_required', { dueAt: at(2026, 10, 20), now: at(2026, 9, 20) })
    ).toMatch(/протокол/i);
  });

  it('просроченный срок назван просроченным', () => {
    const text = nextStepText('retake_required', { dueAt: at(2026, 9, 18), now: at(2026, 9, 20) });
    expect(text).toMatch(/срок прошёл/i);
  });

  it('последний день назван последним днём', () => {
    const text = nextStepText('retake_required', { dueAt: at(2026, 9, 20), now: at(2026, 9, 20) });
    expect(text).toMatch(/последний день/i);
  });

  it('без известного срока сказано, кто его назначит', () => {
    /* «Нужна повторная проверка» без продолжения оставляет человека в тупике. */
    expect(nextStepText('retake_required')).toMatch(/центр/i);
  });

  it('у сдавшего сказано, где взять документ', () => {
    expect(nextStepText('passed')).toMatch(/документ/i);
  });

  it('у тренировки сказано, что попытки не ограничены', () => {
    expect(nextStepText('can_try_again', { attemptsLeft: null })).toMatch(/не ограничен/i);
  });
});

describe('разбор ошибок итоговой не показывается (Р9, пункт 4)', () => {
  it('у итоговой проверки правильных ответов не видно', () => {
    /*
     * Не из вредности: банк вопросов утечёт за несколько попыток, и проверка перестанет
     * что-либо проверять — а по ней выдают документ, который предъявляют инспектору.
     */
    expect(showsAnswerReview('final')).toBe(false);
  });

  it('у тренировки — полный разбор', () => {
    expect(showsAnswerReview('practice')).toBe(true);
  });

  it('у каждого вида проверки русское название', () => {
    for (const label of Object.values(EXAM_PURPOSE_LABELS)) {
      expect(label).toMatch(/^[А-ЯЁ]/);
    }
  });
});
