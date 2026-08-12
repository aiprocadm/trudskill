import type { WorkspaceBlockerItem, WorkspaceTaskItem } from './types';
import type { AttentionItem } from '@trudskill/ui';

/**
 * Сборка очереди «Разобрать» (IA-016, зона 2).
 *
 * Блокеры и просроченные задачи сводятся в ОДИН список. Пока они лежат двумя таблицами,
 * приоритет между «блокер средней важности» и «задача, просроченная на неделю» расставляет
 * сам администратор — а это ровно та работа, которую панель и должна с него снять.
 *
 * Задачи в работе и открытые сюда не попадают: очередь — это то, что горит, а не всё подряд.
 */
export const buildAttentionItems = (
  tasks: readonly WorkspaceTaskItem[],
  blockers: readonly WorkspaceBlockerItem[]
): AttentionItem[] => [
  ...blockers.map((blocker) => ({
    id: `blocker:${blocker.id}`,
    title: blocker.title,
    href: blocker.route,
    severity: blocker.severity,
    kind: 'блокер'
  })),
  ...tasks
    .filter((task) => task.status === 'overdue')
    .map((task) => ({
      id: `task:${task.id}`,
      title: task.title,
      href: task.route,
      // Просроченная задача — всегда «важно»: срок уже нарушен, но это не авария уровня блокера.
      severity: 'medium' as const,
      ...(task.dueAt ? { dueAt: task.dueAt } : {}),
      kind: 'просроченная задача'
    }))
];
