import type { IdentityVerificationStatus } from './types';

export const IDENTITY_STATUS_LABELS: Record<IdentityVerificationStatus, string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  approved: 'Подтверждена',
  rejected: 'Отклонена'
};

export function formatIdentityStatus(status: string): string {
  return IDENTITY_STATUS_LABELS[status as IdentityVerificationStatus] ?? status;
}

/** ДД.ММ.ГГГГ from an ISO timestamp; '—' for absent values. */
export function formatDateShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU');
}

/**
 * Returns a human-readable unavailability label for identity document file errors.
 * Used in the admin detail view when a file cannot be served (AV-gated or missing).
 */
export function fileUnavailableLabel(code?: string): string {
  if (code === 'file_infected' || code === 'file_scan_failed') {
    return 'файл недоступен (антивирус)';
  }
  return 'файл недоступен';
}

/**
 * Сколько заявка ждёт проверки (ФТ-C1.2, Фаза 3 Task 4).
 *
 * Модератору важно видеть не «дату подачи», а именно СРОК ОЖИДАНИЯ: заявка, висящая
 * три дня, — это заблокированный экзамен и звонок в поддержку. Дата подачи требует
 * счёта в уме, срок — нет.
 */
export function formatWaitingTime(submittedAt?: string, now: Date = new Date()): string {
  if (!submittedAt) return '—';
  const submitted = new Date(submittedAt);
  if (Number.isNaN(submitted.getTime())) return '—';

  const minutes = Math.floor((now.getTime() - submitted.getTime()) / 60000);
  // Часы сервера и клиента расходятся: отрицательный срок показываем как «только что»,
  // а не как «-3 мин», иначе модератор решит, что данные битые.
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

/** Заявка ждёт дольше суток — её надо разобрать в первую очередь. */
export function isWaitingTooLong(submittedAt?: string, now: Date = new Date()): boolean {
  if (!submittedAt) return false;
  const submitted = new Date(submittedAt);
  if (Number.isNaN(submitted.getTime())) return false;
  return now.getTime() - submitted.getTime() > 24 * 60 * 60 * 1000;
}
