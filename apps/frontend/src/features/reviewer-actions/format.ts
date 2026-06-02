import type { AssignmentReviewDto } from './types';
import type { AntivirusStatus } from '../practical-submissions/types';

export const REVIEW_STATUS_LABEL: Record<AssignmentReviewDto['status'], string> = {
  pending: 'Ожидает',
  in_review: 'На проверке',
  completed: 'Завершено'
};

export function formatReviewStatus(status: AssignmentReviewDto['status']): string {
  return REVIEW_STATUS_LABEL[status] ?? status;
}

export function formatQueueKind(kind: 'attempt' | 'submission'): string {
  return kind === 'attempt' ? 'Тест (эссе)' : 'Практическая работа';
}

/** V1.1 AV gate: short reviewer-facing label for a file's antivirus status. */
export function formatAntivirusStatus(status: AntivirusStatus): string {
  switch (status) {
    case 'pending':
      return 'файл на проверке';
    case 'infected':
      return 'файл заблокирован (заражён)';
    case 'error':
      return 'ошибка проверки файла';
    case 'clean':
    default:
      return 'файл проверен';
  }
}
