/**
 * Phase 6 КЭП — human-readable badge for an export batch's detached-signature status.
 * Returns null for unsigned/undefined: the seam ships dormant, so most batches are unsigned and a
 * per-row "не подписано" would be noise. Show a chip only when actually signed or failed.
 */
export function exportSignatureBadgeLabel(
  status: 'unsigned' | 'signed' | 'failed' | undefined
): string | null {
  switch (status) {
    case 'signed':
      return 'Подписано КЭП';
    case 'failed':
      return 'Ошибка подписи';
    default:
      return null;
  }
}
