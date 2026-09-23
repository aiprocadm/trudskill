import type { Task } from './types';

/** Дата и время срока по-русски; без срока — прочерк. */
export const formatDue = (iso?: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/** «Просрочена» вычисляется, а не хранится (§4): срок прошёл, а задача ещё не выполнена. */
export const isOverdue = (task: Task, now = new Date()): boolean =>
  Boolean(task.dueAt) &&
  (task.status === 'new' || task.status === 'in_progress') &&
  new Date(task.dueAt!).getTime() < now.getTime();

/** Исполнители — ФИО через запятую; идентификаторы наружу не выводятся. */
export const formatAssignees = (task: Task): string =>
  task.assignees
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ') || '—';

/** К чему привязана задача — словами, без идентификаторов (названия объектов — Фаза 1). */
export const formatLinks = (task: Task): string => {
  const parts: string[] = [];
  if (task.links.groupId) parts.push('Группа');
  if (task.links.learnerId) parts.push('Слушатель');
  if (task.links.counterpartyId) parts.push('Компания');
  if (task.links.contactId) parts.push('Контакт');
  if (task.links.lessonId) parts.push('Занятие');
  return parts.join(', ') || '—';
};

/** Из `datetime-local` (без пояса) — ISO в UTC; пустое поле — undefined. */
export const localToIso = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** ISO → значение для `datetime-local` в поясе браузера. */
export const isoToLocal = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
