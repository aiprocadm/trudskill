import type { EntityStatus, QuestionType, ReviewerQueueListItem, TestRuleSummary } from './types';

/** Phase 3 Plan A: RU label для каждого типа вопроса. */
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: 'Один из списка',
  multiple_choice: 'Несколько из списка',
  number_input: 'Числовой ответ',
  text: 'Краткий текст',
  essay: 'Развёрнутый ответ'
};

export function formatQuestionType(type: QuestionType): string {
  return QUESTION_TYPE_LABEL[type] ?? type;
}

export const ENTITY_STATUS_LABEL: Record<EntityStatus, string> = {
  active: 'Активный',
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'В архиве'
};

export function formatEntityStatus(status: EntityStatus): string {
  return ENTITY_STATUS_LABEL[status] ?? status;
}

/** «42 ± 0.1» если tolerance > 0; «42» если tolerance = 0 или undefined. */
export function formatNumericTolerance(expected: number, tolerance?: number): string {
  if (tolerance === undefined || tolerance === null || tolerance === 0) {
    return String(expected);
  }
  return `${expected} ± ${tolerance}`;
}

/** Правила склонения «балл / балла / баллов» (1, 2, 5). */
export function formatQuestionScore(score: number): string {
  const abs = Math.abs(score);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${score} баллов`;
  if (mod10 === 1) return `${score} балл`;
  if (mod10 >= 2 && mod10 <= 4) return `${score} балла`;
  return `${score} баллов`;
}

/** Сводка правил теста — массив bullet-строк. */
export function formatTestRule(rule: TestRuleSummary): string[] {
  const bullets: string[] = [];
  bullets.push(`Лимит попыток: ${rule.attemptLimit}`);
  bullets.push(`Рандомизация: ${rule.randomizeQuestions ? 'вкл' : 'выкл'}`);
  if (rule.questionCount) bullets.push(`Кол-во вопросов: ${rule.questionCount}`);
  if (rule.timeLimitMinutes) bullets.push(`Лимит времени: ${rule.timeLimitMinutes} мин`);
  bullets.push(`Проходной балл: ${rule.passingScore}`);
  if (rule.dailyResetEnabled) bullets.push('Дневной сброс лимита попыток включён');
  return bullets;
}

/** Title/subtitle для строки в reviewer queue. */
export function formatReviewerQueueItem(item: ReviewerQueueListItem): {
  title: string;
  subtitle: string;
} {
  if (item.kind === 'attempt') {
    return {
      title: `Попытка теста ${item.testId ?? ''}`.trim(),
      subtitle: `Учащийся ${item.learnerId} — отправлено ${formatDateTime(item.submittedAt)}`
    };
  }
  return {
    title: `Практическая работа ${item.assignmentId ?? ''}`.trim(),
    subtitle: `Учащийся ${item.learnerId} — отправлено ${formatDateTime(item.submittedAt)}`
  };
}

/** Простой RU-форматтер ISO timestamp (без зависимостей: YYYY-MM-DD HH:mm). */
export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
