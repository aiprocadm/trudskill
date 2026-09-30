import { apiRequest } from '../../lib/api/client';
import { withAuth } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';
import type { BulkOutcome } from '@trudskill/ui';

/** Строка «Номеров удостоверений»: пустой номер снимает назначение. */
export interface CertificateNumberRow {
  enrollmentId: string;
  number: string;
  series: string;
  rank: string;
}

export interface CertificateNumbersOutcome {
  total: number;
  updated: number;
  failed: number;
  rows: Array<{
    rowNumber: number;
    enrollmentId: string;
    status: 'updated' | 'failed';
    code?: string;
    message?: string;
  }>;
}

/** МГ-F3.2 (срез 20.3b): сохранить номера, серии и разряды удостоверений группы. */
export const certificateNumbersApi = {
  assign: (
    session: UserSession,
    groupId: string,
    rows: CertificateNumberRow[]
  ): Promise<CertificateNumbersOutcome> =>
    apiRequest<CertificateNumbersOutcome>(
      `/groups/${encodeURIComponent(groupId)}/certificate-numbers`,
      {
        method: 'PUT',
        body: {
          rows: rows.map((row) => ({
            enrollmentId: row.enrollmentId,
            number: row.number.trim() || null,
            series: row.series.trim() || null,
            rank: row.rank.trim() || null
          }))
        },
        ...withAuth(session)
      }
    )
};

/**
 * «Заполнить по порядку» от начального номера: последние цифры растут, всё остальное — как
 * в образце. «264501-1» → «264501-1», «264501-2»…; «УД-000137» → «УД-000137», «УД-000138».
 * Без цифр в конце продолжить нечего — пустой список, экран объяснит почему.
 */
export function sequenceFrom(start: string, count: number): string[] {
  const match = /^(.*?)(\d+)(\D*)$/.exec(start.trim());
  if (!match) return [];
  const [, prefix = '', digits = '', suffix = ''] = match;
  const base = Number.parseInt(digits, 10);
  return Array.from(
    { length: count },
    (_, i) => `${prefix}${String(base + i).padStart(digits.length, '0')}${suffix}`
  );
}

/** Порядок строк — как в таблице протокола: по ФИО. Тогда «264501-3» — третья строка протокола. */
export const protocolOrder = <T extends { name: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ru'));

/** Ответ сервера — в итог для экрана: отказы поимённо, а не номерами строк. */
export const toBulkOutcome = (
  outcome: CertificateNumbersOutcome,
  nameOf: (enrollmentId: string) => string
): BulkOutcome => ({
  total: outcome.total,
  succeeded: outcome.updated,
  failures: outcome.rows
    .filter((row) => row.status === 'failed')
    .map((row) => ({
      label: nameOf(row.enrollmentId),
      reason: row.message ?? 'не сохранено'
    }))
});
