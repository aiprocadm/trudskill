import type { TaskDto } from './api';

/**
 * Состояния задачи выпуска по-русски (`TXT-006`).
 *
 * В таблице стояли коды `queued` / `running` / `completed` / `failed`, а колонка называлась
 * «Task ID». Значения подтверждены по коду сервера (`documents.service.ts`,
 * `documents-internal-worker.controller.ts`), а не угаданы по названиям.
 */
export const TASK_STATUS_LABELS: Record<string, string> = {
  queued: 'В очереди',
  running: 'Выпускается',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменена'
};

export const taskStatusLabel = (status: string): string => TASK_STATUS_LABELS[status] ?? status;

/** Откуда пришла задача — источник в данных приходит кодом. */
export const TASK_SOURCE_LABELS: Record<string, string> = {
  manual: 'Запущена вручную',
  api: 'Запущена по API',
  enrollment_completed: 'Обучение завершено',
  group_close: 'Закрытие группы',
  batch: 'Выпуск списком'
};

export const taskSourceLabel = (source: string): string => TASK_SOURCE_LABELS[source] ?? source;

/** Повторить можно только упавшую задачу — иначе повтор создаст дубль документа. */
export const canRetry = (task: TaskDto): boolean => task.status === 'failed';

/** Отменить можно только то, что ещё не выпущено. */
export const canCancel = (task: TaskDto): boolean =>
  task.status === 'queued' || task.status === 'running';
