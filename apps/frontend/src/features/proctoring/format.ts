import type { ProctoringRecordingStatus } from './types';

export const PROCTORING_STATUS_LABELS: Record<ProctoringRecordingStatus, string> = {
  recording: 'Идёт запись',
  completed: 'Завершена'
};

export function formatProctoringStatus(status: string): string {
  return PROCTORING_STATUS_LABELS[status as ProctoringRecordingStatus] ?? status;
}

/** ДД.ММ.ГГГГ from an ISO timestamp; '—' for absent values. */
export function formatDateShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU');
}

/** Human label for a chunk issue in the admin player warnings list. */
export function chunkIssueLabel(issue: { sequence: number; code: string }): string {
  const n = issue.sequence + 1;
  if (issue.code === 'missing_chunk') {
    return `Фрагмент ${n}: не был загружен (разрыв записи)`;
  }
  if (issue.code === 'file_infected' || issue.code === 'file_scan_failed') {
    return `Фрагмент ${n}: недоступен (антивирус)`;
  }
  return `Фрагмент ${n}: недоступен`;
}
