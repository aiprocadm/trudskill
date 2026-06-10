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
