/**
 * Phase 5C — типы UI очереди переаттестации. Дублируем backend-union на фронте,
 * чтобы лейблы статусов проверялись на этапе компиляции (как в licenses/types.ts).
 */

import type { SemanticStatus } from '@trudskill/ui';

export type RecertificationDraftStatus = 'pending' | 'approved' | 'rejected';

/** Raw row as returned by reject/scan endpoints (без обогащения). */
export interface RecertificationDraft {
  id: string;
  tenantId: string;
  learnerId: string;
  sourceDocumentId: string;
  courseVersionId: string;
  validUntil: string;
  status: RecertificationDraftStatus;
  resultingEnrollmentId?: string;
  reason?: string;
  decidedAt?: string;
  decidedBy?: string;
  /**
   * Имя решившего — подставляет сервер (§5.431).
   *
   * Пусто, если решения ещё нет либо учётную запись удалили: экран говорит об этом прямо,
   * а не подставляет «система» и не показывает сырой идентификатор (правило продукта №2).
   */
  decidedByName?: string;
  createdAt: string;
  updatedAt: string;
}

/** Enriched row returned by GET /recertification-drafts (list). */
export interface RecertificationDraftView extends RecertificationDraft {
  learnerName: string;
  learnerSnils?: string;
  courseTitle: string;
}

/** POST /recertification/scan summary. */
export interface RecertScanSummary {
  draftsCreated: number;
  emailsDispatched: number;
}

export const RECERT_STATUS_LABELS: Record<RecertificationDraftStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрен',
  rejected: 'Отклонён'
};

/**
 * Цвет чипа для статуса заявки на переаттестацию (`UI-023`): доменный статус
 * сопоставляется ключу общей палитры. «Ожидает» — работа впереди, «Одобрен» — успех,
 * «Отклонён» — отказ. Раньше в цвет уходила подпись, и вся очередь была серой.
 */
export const RECERT_STATUS_TONE: Record<RecertificationDraftStatus, SemanticStatus> = {
  pending: 'pending',
  approved: 'completed',
  rejected: 'failed'
};
