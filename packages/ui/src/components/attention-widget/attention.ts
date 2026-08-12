export type AttentionSeverity = 'high' | 'medium' | 'low';

export interface AttentionItem {
  id: string;
  title: string;
  href: string;
  severity: AttentionSeverity;
  /** ISO-дата срока. Просроченное поднимается выше при равной критичности. */
  dueAt?: string;
  kind?: string;
}

const SEVERITY_WEIGHT: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Очередь «Разобрать» (CMP-013).
 *
 * Правило ТЗ: элементы сортируются по СРОЧНОСТИ, а не по типу. Человеку нужна очередь,
 * а не оглавление — иначе он сам сравнивает блокеры с задачами и решает, что важнее.
 * При равной критичности вперёд идёт то, у чего срок ближе; элементы без срока — последними
 * внутри своей группы.
 */
export const sortByUrgency = (items: readonly AttentionItem[]): AttentionItem[] =>
  [...items].sort((a, b) => {
    const bySeverity = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (bySeverity !== 0) return bySeverity;

    const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.NaN;
    const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.NaN;
    const aHas = Number.isFinite(aDue);
    const bHas = Number.isFinite(bDue);
    if (aHas && bHas) return aDue - bDue;
    if (aHas) return -1;
    if (bHas) return 1;
    // Оба без срока — порядок стабильный, чтобы список не «прыгал» между обновлениями.
    return a.id.localeCompare(b.id);
  });

/** Просрочено — не украшение, а причина поднять строку в глазах пользователя. */
export const isOverdue = (item: AttentionItem, now: number): boolean => {
  if (!item.dueAt) return false;
  const due = Date.parse(item.dueAt);
  return Number.isFinite(due) && due < now;
};
