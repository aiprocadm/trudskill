import { addDays } from '../../../common/utils/date-math.util.js';

/**
 * ФТ-E4 (Фаза 4 Task 9): дашборд «истекающие удостоверения».
 *
 * Чистая выборка и группировка — считается одинаково в тесте и в бою.
 *
 * Просроченные документы попадают в дашборд НАРАВНЕ с истекающими и идут первыми:
 * «срок вышел вчера» — самая срочная строка в работе методиста, а не архивная запись.
 * Именно из-за этого нельзя фильтровать по «validUntil между сегодня и горизонтом».
 */

export type ExpiryUrgency = 'expired' | 'critical' | 'soon' | 'later';

export interface ExpiringDocumentInput {
  id: string;
  documentNumber?: string | undefined;
  documentType: string;
  learnerNamePublic?: string | undefined;
  sourceEntityId?: string | undefined;
  validUntil?: string | undefined;
  status: string;
  revokedAt?: string | undefined;
}

export interface ExpiringDocument {
  id: string;
  documentNumber: string | null;
  documentType: string;
  learnerName: string | null;
  enrollmentId: string | null;
  validUntil: string;
  /** Отрицательное значение = срок уже вышел столько дней назад. */
  daysLeft: number;
  urgency: ExpiryUrgency;
}

export interface ExpiringSummary {
  total: number;
  expired: number;
  critical: number;
  soon: number;
  later: number;
}

/** Целые дни между датами (обе — `YYYY-MM-DD`), без часовых поясов. */
export const daysBetween = (from: string, to: string): number => {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
};

/** Срочность: те же пороги, что у напоминаний (ФТ-E4: 7 / 30 / 60). */
export const urgencyOf = (daysLeft: number): ExpiryUrgency => {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'critical';
  if (daysLeft <= 30) return 'soon';
  return 'later';
};

/**
 * Документы, срок которых вышел или выходит в пределах горизонта.
 * Отозванные и архивные исключаются: продлевать нечего.
 */
export const selectExpiringDocuments = (
  today: string,
  documents: readonly ExpiringDocumentInput[],
  horizonDays: number
): ExpiringDocument[] => {
  const horizon = addDays(today.slice(0, 10), horizonDays);
  return (
    documents
      .filter(
        (doc) =>
          Boolean(doc.validUntil) &&
          !doc.revokedAt &&
          doc.status !== 'revoked' &&
          doc.status !== 'archived' &&
          doc.validUntil!.slice(0, 10) <= horizon
      )
      .map((doc) => {
        const validUntil = doc.validUntil!.slice(0, 10);
        const daysLeft = daysBetween(today.slice(0, 10), validUntil);
        return {
          id: doc.id,
          documentNumber: doc.documentNumber ?? null,
          documentType: doc.documentType,
          learnerName: doc.learnerNamePublic ?? null,
          enrollmentId: doc.sourceEntityId ?? null,
          validUntil,
          daysLeft,
          urgency: urgencyOf(daysLeft)
        };
      })
      // Самые срочные первыми: просроченные, затем ближайшие по сроку.
      .sort((a, b) => a.daysLeft - b.daysLeft || a.id.localeCompare(b.id))
  );
};

export const summarize = (documents: readonly ExpiringDocument[]): ExpiringSummary => ({
  total: documents.length,
  expired: documents.filter((d) => d.urgency === 'expired').length,
  critical: documents.filter((d) => d.urgency === 'critical').length,
  soon: documents.filter((d) => d.urgency === 'soon').length,
  later: documents.filter((d) => d.urgency === 'later').length
});
