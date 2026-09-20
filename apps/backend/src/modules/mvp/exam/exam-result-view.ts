import {
  type ExamOutcome,
  type ExamPurpose,
  type ExamRetakePolicy,
  attemptLimitFor,
  daysUntil,
  examOutcome,
  formatDueDate,
  nextStepText,
  outcomeHeadline,
  retakeDueAt,
  showsAnswerReview
} from './retake-policy.js';

/**
 * Что слушатель видит на экране результата (ТЗ «Стабилизация, UX и развитие», 10.4, пункт 5).
 *
 * **Что было.** Экран показывал «Тест пройден / не пройден» и число набранных баллов. Ни
 * процента, ни проходного порога, ни времени прохождения, ни — главное — ответа на вопрос
 * «что дальше». Для регулируемого обучения последнее важнее всего: слушатель после неуда не
 * понимает, потерял ли он обучение целиком, и звонит в центр (журнал 595).
 *
 * **Почему проценты, а не баллы.** «Набрано 17 из 24» человек сравнивает с порогом в уме и
 * ошибается. Порог в системе задан процентом, значит и результат надо показывать процентом —
 * иначе человек сравнивает несравнимое.
 *
 * **Почему темы, а не разбор.** У итоговой проверки правильные ответы не показываются (Р9,
 * пункт 4): банк вопросов утечёт за несколько попыток, и проверка перестанет что-либо
 * проверять — а по ней выдают документ, который предъявляют инспектору. Тем достаточно, чтобы
 * понять, что повторить, и недостаточно, чтобы выучить ответы наизусть.
 */

export interface ExamResultViewInput {
  purpose: ExamPurpose;
  passed: boolean;
  awaitingReview: boolean;
  attemptsUsed: number;
  /** Ограничение попыток теста (для теста модуля). */
  ruleAttemptLimit?: number;
  score: number;
  maxScore: number;
  /** Проходной порог теста — в той же мере, что и баллы. */
  passingScore: number;
  startedAt?: string;
  submittedAt?: string;
  /** Темы, в которых были ошибки. Без вопросов и без правильных ответов. */
  topicsWithErrors?: string[];
  policy: ExamRetakePolicy;
  now: Date;
}

export interface ExamResultView {
  outcome: ExamOutcome;
  headline: string;
  nextStep: string;
  purposeLabel: string;
  /** Сколько набрано, в процентах. Округляется вниз: 79,8% — это ещё не 80%. */
  scorePercent: number;
  /** Проходной порог, в процентах. */
  passingPercent: number;
  /** «Набрано 17 из 24» — рядом с процентом, для тех, кто считает в баллах. */
  scoreLine: string;
  /** Сколько заняло прохождение. Пусто, если начало или конец неизвестны. */
  durationText?: string;
  /** Что повторить. Пусто, если ошибок не было или темы не размечены. */
  topicsToRevise: string[];
  /** Показывать ли разбор с правильными ответами. */
  showsAnswers: boolean;
  /** До какого числа нужна повторная проверка (только при `retake_required`). */
  retakeDueAt?: string;
  /** Тот же срок словами: «до 20 октября». */
  retakeDueText?: string;
  /** Сколько дней осталось. Отрицательное — срок прошёл. */
  retakeDaysLeft?: number;
  attemptsUsed: number;
  /** Сколько попыток осталось. `null` — без ограничения. */
  attemptsLeft: number | null;
}

/**
 * Процент от максимума.
 *
 * **Округление ВНИЗ — не придирка.** При округлении к ближайшему 79,6% превращается в 80%, и
 * человек, не набравший порога, видит на экране ровно пороговое число рядом со словами «не
 * пройдено». Объяснить это невозможно.
 */
const percent = (value: number, max: number): number =>
  max > 0 ? Math.floor((value / max) * 100) : 0;

/** Склонение слов «минута» и «час». */
const word = (count: number, forms: [string, string, string]): string => {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
};

/**
 * Сколько заняло прохождение.
 *
 * Меньше минуты — так и пишем: «меньше минуты». «0 минут» человек читает как сбой.
 */
export const durationText = (startedAt?: string, submittedAt?: string): string | undefined => {
  if (!startedAt || !submittedAt) return undefined;
  const from = new Date(startedAt).getTime();
  const to = new Date(submittedAt).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return undefined;
  const minutes = Math.floor((to - from) / 60_000);
  if (minutes < 1) return 'меньше минуты';
  if (minutes < 60) return `${minutes} ${word(minutes, ['минута', 'минуты', 'минут'])}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursText = `${hours} ${word(hours, ['час', 'часа', 'часов'])}`;
  if (rest === 0) return hoursText;
  return `${hoursText} ${rest} ${word(rest, ['минута', 'минуты', 'минут'])}`;
};

const PURPOSE_LABELS: Record<ExamPurpose, string> = {
  final: 'Итоговая проверка знаний',
  module: 'Тест модуля',
  practice: 'Тренировочное тестирование'
};

/** Собрать всё, что человек увидит на экране результата. */
export const buildExamResultView = (input: ExamResultViewInput): ExamResultView => {
  const attemptLimit = attemptLimitFor(input.purpose, input.policy, input.ruleAttemptLimit);
  const outcome = examOutcome({
    purpose: input.purpose,
    passed: input.passed,
    awaitingReview: input.awaitingReview,
    attemptsUsed: input.attemptsUsed,
    attemptLimit
  });

  const attemptsLeft =
    attemptLimit === null ? null : Math.max(0, attemptLimit - input.attemptsUsed);

  /*
   * Срок считается от дня СДАЧИ попытки, а не от «сейчас»: человек может открыть результат
   * через неделю, и срок не должен от этого сдвигаться. Без даты сдачи срока нет — текст
   * тогда говорит, что дату назначит центр.
   */
  const failedAt = input.submittedAt ? new Date(input.submittedAt) : undefined;
  const due =
    outcome === 'retake_required' && failedAt && !Number.isNaN(failedAt.getTime())
      ? retakeDueAt(failedAt, input.policy)
      : undefined;

  const view: ExamResultView = {
    outcome,
    headline: outcomeHeadline(outcome),
    nextStep: nextStepText(outcome, {
      ...(due ? { dueAt: due } : {}),
      now: input.now,
      attemptsLeft
    }),
    purposeLabel: PURPOSE_LABELS[input.purpose],
    scorePercent: percent(input.score, input.maxScore),
    passingPercent: percent(input.passingScore, input.maxScore),
    scoreLine: `${input.score} из ${input.maxScore}`,
    topicsToRevise: input.passed ? [] : (input.topicsWithErrors ?? []),
    showsAnswers: showsAnswerReview(input.purpose),
    attemptsUsed: input.attemptsUsed,
    attemptsLeft
  };

  const duration = durationText(input.startedAt, input.submittedAt);
  if (duration) view.durationText = duration;

  if (due) {
    view.retakeDueAt = due.toISOString();
    view.retakeDueText = formatDueDate(due);
    view.retakeDaysLeft = daysUntil(due, input.now);
  }

  return view;
};

/**
 * Повторная проверка знаний как задача центра (ТЗ 10.4, пункт 2).
 *
 * **Своего хранилища у неё нет намеренно** — тот же приём, что у панели руководителя.
 * Отдельная таблица задач пришлось бы пересчитывать при каждой пересдаче и закрывать при
 * каждом успехе; она разошлась бы с действительностью при первом же пропущенном событии, и
 * центр работал бы по списку, который врёт. Здесь список считается из попыток на лету:
 * пересдал — строка исчезла сама.
 */
export interface RetakeTask {
  learnerId: string;
  learnerName: string;
  testId: string;
  testTitle: string;
  /** Когда была неудачная проверка. */
  failedAt: string;
  /** До какого числа нужна повторная. */
  dueAt: string;
  /** Отрицательное — срок прошёл. */
  daysLeft: number;
  overdue: boolean;
}

export interface RetakeSourceAttempt {
  learnerId: string;
  learnerName: string;
  testId: string;
  testTitle: string;
  purpose: ExamPurpose;
  passed: boolean;
  awaitingReview: boolean;
  submittedAt?: string;
}

/**
 * Кому нужна повторная проверка знаний и до какого числа.
 *
 * Берутся только итоговые проверки: тренировку и тест модуля пересдают без всякого срока, и
 * попав в этот список, они утопили бы настоящие случаи.
 *
 * **Сдавший позже исчезает из списка сам.** Проверка идёт по последней попытке на пару
 * «слушатель + тест»: если человек пересдал, последняя попытка успешна, и задачи нет.
 */
export const retakeTasks = (
  attempts: RetakeSourceAttempt[],
  policy: ExamRetakePolicy,
  now: Date
): RetakeTask[] => {
  const latest = new Map<string, RetakeSourceAttempt>();
  for (const attempt of attempts) {
    if (attempt.purpose !== 'final') continue;
    if (!attempt.submittedAt) continue;
    const key = `${attempt.learnerId}::${attempt.testId}`;
    const previous = latest.get(key);
    if (!previous || (previous.submittedAt ?? '') < attempt.submittedAt) {
      latest.set(key, attempt);
    }
  }

  const tasks: RetakeTask[] = [];
  for (const attempt of latest.values()) {
    if (attempt.passed || attempt.awaitingReview) continue;
    const failedAt = new Date(attempt.submittedAt as string);
    if (Number.isNaN(failedAt.getTime())) continue;
    const due = retakeDueAt(failedAt, policy);
    const left = daysUntil(due, now);
    tasks.push({
      learnerId: attempt.learnerId,
      learnerName: attempt.learnerName,
      testId: attempt.testId,
      testTitle: attempt.testTitle,
      failedAt: attempt.submittedAt as string,
      dueAt: due.toISOString(),
      daysLeft: left,
      overdue: left < 0
    });
  }

  /* Самое горящее — сверху: просроченное, потом ближайшее по сроку. */
  return tasks.sort((a, b) => a.daysLeft - b.daysLeft);
};
