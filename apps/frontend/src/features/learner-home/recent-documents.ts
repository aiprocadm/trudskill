import type { LearnerDocument } from '../learner-documents/types';

/**
 * Phase 1 §4.3 — pure logic для виджета «Последние документы» на главной.
 *
 * Берём первые `limit` штук **уже отсортированного** ответа `GET /me/documents`
 * (бекенд сортирует по documentDate desc → id desc, см. MvpService.listMyDocuments).
 *
 * Аннулированные документы фильтруем из preview — главный экран должен
 * показывать достижения, а не отзывы. Полный список (включая revoked с
 * причиной) виден на `/learner/documents`.
 */
export const pickRecentDocuments = (
  documents: LearnerDocument[] | undefined,
  limit = 3
): LearnerDocument[] => {
  if (!documents || documents.length === 0) return [];
  return documents.filter((d) => d.status !== 'revoked').slice(0, limit);
};
