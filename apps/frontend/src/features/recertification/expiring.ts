import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * ФТ-E4 (Фаза 4 Task 9): дашборд «истекающие удостоверения» и периодичность программы.
 *
 * Логика — чистые функции (RTL в проекте нет, конвенция CLAUDE.md); экран остаётся тонким.
 */

export type ExpiryUrgency = 'expired' | 'critical' | 'soon' | 'later';

export interface ExpiringDocumentDto {
  id: string;
  documentNumber: string | null;
  documentType: string;
  learnerName: string | null;
  enrollmentId: string | null;
  validUntil: string;
  daysLeft: number;
  urgency: ExpiryUrgency;
}

export interface ExpiringResponseDto {
  items: ExpiringDocumentDto[];
  summary: { total: number; expired: number; critical: number; soon: number; later: number };
  horizonDays: number;
}

export const URGENCY_LABELS: Record<ExpiryUrgency, string> = {
  expired: 'Срок истёк',
  critical: 'Осталась неделя',
  soon: 'Меньше месяца',
  later: 'Меньше двух месяцев'
};

/** Человеческая формулировка срока — «через 12 дней» / «просрочено на 3 дня». */
export const formatDaysLeft = (daysLeft: number): string => {
  if (daysLeft < 0) return `просрочено на ${pluralDays(-daysLeft)}`;
  if (daysLeft === 0) return 'истекает сегодня';
  return `через ${pluralDays(daysLeft)}`;
};

/** Русские окончания: 1 день / 2 дня / 5 дней, с учётом 11–14. */
export const pluralDays = (n: number): string => {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${abs} дней`;
  if (mod10 === 1) return `${abs} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${abs} дня`;
  return `${abs} дней`;
};

/**
 * ФТ-E4: пресеты периодичности переобучения. Значения из практики регулируемого ДПО:
 * охрана труда и пожарная безопасность — раз в 3 года, электробезопасность и медицина —
 * ежегодно. «Бессрочно» — отдельный осмысленный вариант, а не пустое поле.
 */
export const RECERT_PRESETS = [
  { months: 36, label: '3 года (охрана труда, пожарная безопасность)' },
  { months: 12, label: '1 год (электробезопасность, медицина)' },
  { months: null, label: 'Бессрочно' }
] as const;

/** Ввод периодичности: пусто = бессрочно, мусор = null с признаком ошибки. */
export const parseRecertMonths = (
  input: string
): { valid: true; months: number | null } | { valid: false } => {
  const trimmed = input.trim();
  if (trimmed === '') return { valid: true, months: null };
  if (!/^\d{1,3}$/.test(trimmed)) return { valid: false };
  const months = Number(trimmed);
  // Верхняя граница — 10 лет: больше похоже на опечатку, чем на регламент.
  if (months < 1 || months > 120) return { valid: false };
  return { valid: true, months };
};

export const recertificationApi = {
  listExpiring: (session: UserSession) =>
    apiRequest<ExpiringResponseDto>('/recertification/expiring', {
      auth: {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId,
        userId: session.user.id
      }
    })
};
