import type { LearnerDocument } from './types';

/**
 * Phase 6 — человекочитаемый бейдж статуса НЭП-подписи.
 * Возвращает null для unsigned/undefined: пока seam dormant большинство документов
 * не подписаны, и бейдж «не подписана» на каждой строке был бы шумом. Показываем
 * чип только когда подпись действительно проставлена или упала.
 */
export function signatureBadgeLabel(status: LearnerDocument['signatureStatus']): string | null {
  switch (status) {
    case 'signed':
      return 'Подписана НЭП';
    case 'failed':
      return 'Ошибка подписи';
    default:
      return null;
  }
}
