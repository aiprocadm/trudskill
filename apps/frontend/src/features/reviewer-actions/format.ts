import type { AssignmentReviewDto } from './types';

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
