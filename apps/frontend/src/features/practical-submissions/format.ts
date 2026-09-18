import type { AntivirusStatus, SubmissionStatus } from './types';

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  not_started: 'Не начато',
  draft: 'Черновик',
  submitted: 'Отправлено',
  under_review: 'На проверке',
  reviewed: 'Проверено',
  returned: 'Возвращено на доработку',
  rejected: 'Отклонено'
};

export function formatSubmissionStatus(status: SubmissionStatus): string {
  return SUBMISSION_STATUS_LABEL[status] ?? status;
}

/** A returned submission is editable again; a draft/not_started is editable. */
export function isSubmissionEditable(status: SubmissionStatus): boolean {
  return status === 'not_started' || status === 'draft' || status === 'returned';
}

/**
 * Почему «Отправить на проверку» сейчас нельзя (ТЗ 5.8 / Э8).
 *
 * Кнопка выключалась молча, и слушатель, уже отправивший работу, жал по ней снова, не понимая,
 * дошла она или нет (журнал 465). Причина называет СОСТОЯНИЕ работы, а не «недоступно».
 */
export function submitBlockedReason(status: SubmissionStatus): string | undefined {
  if (isSubmissionEditable(status)) return undefined;
  if (status === 'reviewed') return 'Работа уже проверена — оценка выставлена.';
  if (status === 'rejected')
    return 'Работа отклонена. Дождитесь, пока преподаватель вернёт её на доработку.';
  if (status === 'under_review') return 'Работу уже проверяет преподаватель.';
  return 'Работа уже отправлена и ждёт проверки преподавателем.';
}

export function formatMaxScore(maxScore: number): string {
  return `Макс. балл: ${maxScore}`;
}

/** V1.1 AV gate: learner-facing description of an attached file's antivirus scan status. */
export function formatAntivirusStatusLearner(status: AntivirusStatus): string {
  switch (status) {
    case 'pending':
      return 'Файл проверяется антивирусом…';
    case 'infected':
      return 'Файл заблокирован: обнаружена угроза';
    case 'error':
      return 'Не удалось проверить файл';
    case 'clean':
    default:
      return 'Файл проверен';
  }
}
