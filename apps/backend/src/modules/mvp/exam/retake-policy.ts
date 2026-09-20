/**
 * Правила попыток и пересдач итоговой проверки знаний (ТЗ «Стабилизация, UX и развитие»,
 * задача 10.4, решение владельца Р9).
 *
 * **Главное, и это не техническая деталь.** Модель попыток строится по пункту 79 Порядка
 * № 2464, а не по игровой логике «три жизни». Работник, показавший неудовлетворительные
 * знания, не допускается к самостоятельному выполнению обязанностей и **направляется на
 * повторную проверку знаний в течение 30 календарных дней** со дня проверки.
 *
 * Разница видна на одном примере. В игровой логике неуд — это конец: попытки кончились,
 * слушатель «сгорел», и что с ним делать дальше, система не знает. По Порядку неуд — это
 * СОБЫТИЕ, которое рождает задачу со сроком: до такого-то числа человек обязан пройти
 * проверку повторно. Разные вещи и для слушателя, и для центра, и для проверяющего.
 *
 * **Три вида проверки, и путать их нельзя:**
 * - `final` — итоговая проверка знаний. Одна попытка; результат идёт в протокол и в реестр
 *   обученных лиц — **в том числе неудовлетворительный**.
 * - `module` — промежуточный тест модуля. Учебный шаг внутри курса, в протокол не идёт.
 * - `practice` — тренировочное тестирование. Без ограничения попыток, с полным разбором
 *   ошибок; отдельная сущность, в протокол не идёт.
 *
 * **Почему чистый модуль.** Здесь считаются сроки и число попыток — то, что обязано
 * проверяться на конкретную дату, а не «как-нибудь в базе». Ошибка в расчёте срока
 * незаметна: он просто окажется другим, и узнают об этом, когда слушателя не допустят.
 */

/** Назначение проверки. Набор закрыт: новый вид — это новое правило, а не строка в словаре. */
export type ExamPurpose = 'final' | 'module' | 'practice';

/** Человеческие названия. На экране не должно быть ни одного кода. */
export const EXAM_PURPOSE_LABELS: Record<ExamPurpose, string> = {
  final: 'Итоговая проверка знаний',
  module: 'Тест модуля',
  practice: 'Тренировочное тестирование'
};

/**
 * Назначение проверки по самому тесту.
 *
 * Признак может быть не задан: тесты, заведённые до появления этой задачи, его не имеют.
 * Тогда он выводится из привязки к модулю — привязан к модулю значит учебный шаг внутри
 * курса, не привязан значит итоговая проверка знаний по курсу. Так старые данные получают
 * верное правило без единой правки в базе.
 *
 * Тренировочное тестирование вывести не из чего: оно отмечается явно.
 */
export const purposeOfTest = (test: {
  moduleId?: string | undefined;
  purpose?: ExamPurpose | undefined;
}): ExamPurpose => test.purpose ?? (test.moduleId ? 'module' : 'final');

export interface ExamRetakePolicy {
  /**
   * Сколько попыток даётся на итоговую проверку.
   *
   * Р9 говорит «одна». Записано настройкой, а не числом в коде: правило репозитория про
   * всё, что выглядит как число. Центр, у которого свой регламент, поднимет значение сам —
   * но по умолчанию действует Порядок.
   */
  finalAttemptLimit: number;
  /**
   * За сколько календарных дней слушатель обязан пройти повторную проверку.
   *
   * Тридцать — из пункта 79. Дни именно КАЛЕНДАРНЫЕ: в Порядке так и написано, и считать
   * рабочие означало бы дать человеку больше времени, чем положено.
   */
  retakeWindowDays: number;
}

export const DEFAULT_EXAM_RETAKE_POLICY: ExamRetakePolicy = {
  finalAttemptLimit: 1,
  retakeWindowDays: 30
};

/** Ключ настройки в свободном наборе настроек центра. */
export const EXAM_RETAKE_SETTINGS_KEY = 'examRetake';

const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 10;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 365;

const clamp = (raw: unknown, fallback: number, min: number, max: number): number => {
  /*
   * Пустое значение — это «настройка не задана», а не ноль. Иначе `null` в настройке
   * превращается в число 0 и приводится к минимуму: срок повторной проверки молча
   * становится ОДНИМ днём вместо тридцати. Ровно это и поймал сторож при первой же
   * подсадке — `Number(null)` равен нулю, в отличие от `Number(undefined)`.
   */
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const whole = Math.floor(value);
  if (whole < min) return min;
  if (whole > max) return max;
  return whole;
};

/**
 * Привести настройку центра к допустимой.
 *
 * Непонятное значение — это значение по умолчанию, а не «без ограничений»: опечатка в
 * настройке не должна молча превращать итоговую проверку в тренировку.
 */
export const resolveExamRetakePolicy = (raw: unknown): ExamRetakePolicy => {
  const source = (raw ?? {}) as Partial<Record<keyof ExamRetakePolicy, unknown>>;
  return {
    finalAttemptLimit: clamp(
      source.finalAttemptLimit,
      DEFAULT_EXAM_RETAKE_POLICY.finalAttemptLimit,
      MIN_ATTEMPTS,
      MAX_ATTEMPTS
    ),
    retakeWindowDays: clamp(
      source.retakeWindowDays,
      DEFAULT_EXAM_RETAKE_POLICY.retakeWindowDays,
      MIN_WINDOW_DAYS,
      MAX_WINDOW_DAYS
    )
  };
};

/**
 * Сколько попыток положено этой проверке.
 *
 * `null` означает «без ограничения» — это тренировочное тестирование, и ограничивать его
 * нечем и незачем: оно для того и заведено, чтобы человек пробовал сколько нужно.
 *
 * У итоговой проверки число берётся из настройки центра, а НЕ из правила теста. Иначе
 * решение Р9 обходилось бы галочкой в карточке теста, и «одна попытка» держалось бы на том,
 * что все методисты помнят про Порядок.
 */
export const attemptLimitFor = (
  purpose: ExamPurpose,
  policy: ExamRetakePolicy,
  ruleLimit?: number
): number | null => {
  if (purpose === 'practice') return null;
  if (purpose === 'final') return policy.finalAttemptLimit;
  /* Тест модуля — учебный шаг: сколько попыток, решает методист в карточке теста. */
  return Math.max(1, ruleLimit ?? 1);
};

/** Исход проверки для слушателя. */
export type ExamOutcome =
  /** Сдал. */
  | 'passed'
  /** Не сдал итоговую: нужна повторная проверка знаний в срок. */
  | 'retake_required'
  /** Не сдал тест модуля или тренировку: можно пробовать дальше. */
  | 'can_try_again'
  /** Ждёт проверки преподавателем: развёрнутые ответы ещё не оценены. */
  | 'awaiting_review';

export interface ExamOutcomeInput {
  purpose: ExamPurpose;
  passed: boolean;
  awaitingReview: boolean;
  attemptsUsed: number;
  attemptLimit: number | null;
}

/**
 * Чем кончилась проверка.
 *
 * **Порядок проверок важен.** Сначала «ждёт проверки»: пока развёрнутые ответы не оценены
 * человеком, говорить «не сдал» нельзя — результат ещё изменится, а слушатель уже расстроен
 * и звонит в центр. Дальше «сдал». И только потом разбирается, что делать с неудом.
 */
export const examOutcome = (input: ExamOutcomeInput): ExamOutcome => {
  if (input.awaitingReview) return 'awaiting_review';
  if (input.passed) return 'passed';
  if (input.purpose === 'final') return 'retake_required';
  if (input.attemptLimit !== null && input.attemptsUsed >= input.attemptLimit)
    return 'retake_required';
  return 'can_try_again';
};

/**
 * До какого числа слушатель обязан пройти повторную проверку.
 *
 * Считается от дня проверки, в календарных днях. Возвращается начало суток: срок — это
 * ДЕНЬ, а не момент; «до 20 октября» не значит «до 14:37 20 октября».
 */
export const retakeDueAt = (failedAt: Date, policy: ExamRetakePolicy): Date => {
  const due = new Date(failedAt.getTime());
  due.setDate(due.getDate() + policy.retakeWindowDays);
  due.setHours(0, 0, 0, 0);
  return due;
};

/** Сколько дней осталось до срока. Отрицательное число — срок прошёл. */
export const daysUntil = (dueAt: Date, now: Date): number => {
  const startOfDue = new Date(dueAt.getTime());
  startOfDue.setHours(0, 0, 0, 0);
  const startOfNow = new Date(now.getTime());
  startOfNow.setHours(0, 0, 0, 0);
  return Math.round((startOfDue.getTime() - startOfNow.getTime()) / 86_400_000);
};

/** Склонение слова «день». */
const dayWord = (count: number): string => {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
};

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
];

/** Дата словами: «20 октября». Цифровой формат человек читает медленнее и путает с кодом. */
export const formatDueDate = (dueAt: Date): string =>
  `${dueAt.getDate()} ${MONTHS[dueAt.getMonth()] ?? ''}`;

/**
 * Что человеку делать дальше и в какой срок (ТЗ 10.4, пункт 5).
 *
 * **Экран результата обязан отвечать на «что дальше».** «Тест не пройден» — это сообщение о
 * прошлом; человек после него не знает ни что теперь будет, ни что от него требуется. Для
 * регулируемого обучения это особенно важно: слушатель чаще всего не понимает, потерял ли он
 * обучение целиком.
 */
export const nextStepText = (
  outcome: ExamOutcome,
  options: { dueAt?: Date; now?: Date; attemptsLeft?: number | null } = {}
): string => {
  if (outcome === 'awaiting_review')
    return 'Развёрнутые ответы проверит преподаватель. Итог появится здесь же — обычно в течение рабочего дня.';
  if (outcome === 'passed')
    return 'Проверка знаний пройдена. Документ появится в разделе «Мои документы» после оформления центром.';
  if (outcome === 'retake_required') {
    if (!options.dueAt)
      return 'Нужна повторная проверка знаний. Дату назначит учебный центр — он свяжется с вами.';
    const left = options.now ? daysUntil(options.dueAt, options.now) : null;
    const base = `Нужна повторная проверка знаний — до ${formatDueDate(options.dueAt)}.`;
    /*
     * Результат остаётся в протоколе и в реестре обученных лиц в любом случае (Р9, пункт 1).
     * Умолчать об этом нельзя: человек узнает об этом от работодателя и решит, что его
     * обманули.
     */
    const registry = ' Результат этой проверки уже внесён в протокол.';
    if (left === null) return base + registry;
    if (left < 0) return `${base} Срок прошёл ${Math.abs(left)} ${dayWord(left)} назад.${registry}`;
    if (left === 0) return `${base} Сегодня последний день.${registry}`;
    return `${base} Осталось ${left} ${dayWord(left)}.${registry}`;
  }
  const left = options.attemptsLeft;
  if (left === null || left === undefined)
    return 'Можно пройти тест ещё раз — число попыток не ограничено.';
  return `Можно пройти тест ещё раз: осталось ${left} ${left === 1 ? 'попытка' : 'попытки'}.`;
};

/** Заголовок на экране результата. Называет исход, а не действие. */
export const outcomeHeadline = (outcome: ExamOutcome): string => {
  switch (outcome) {
    case 'passed':
      return 'Проверка знаний пройдена';
    case 'awaiting_review':
      return 'Ответы на проверке';
    case 'retake_required':
      return 'Требуется повторная проверка знаний';
    default:
      return 'Тест не пройден';
  }
};

/**
 * Показывать ли разбор ошибок с правильными ответами (Р9, пункт 4).
 *
 * У итоговой проверки — нет. Не из вредности: банк вопросов утечёт за несколько попыток, и
 * проверка перестанет что-либо проверять — а по ней выдают документ, который предъявляют
 * инспектору. Слушателю показываются процент, порог и ТЕМЫ с ошибками: этого достаточно,
 * чтобы понять, что повторить, и недостаточно, чтобы выучить ответы наизусть.
 */
export const showsAnswerReview = (purpose: ExamPurpose): boolean => purpose !== 'final';
