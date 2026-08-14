import { describe, expect, it } from 'vitest';

import { ALL_TEMPLATE_TYPES, TEMPLATE_TYPE_LABELS, templateTypeLabel } from './document-types';
import {
  TASK_STATUS_LABELS,
  canCancel,
  canRetry,
  taskSourceLabel,
  taskStatusLabel
} from './task-labels';

import type { TaskDto } from './api';

const task = (status: string): TaskDto => ({ id: 't1', status, source: 'manual' });

describe('подписи задач выпуска (TXT-006)', () => {
  it('состояния сервера подписаны по-русски', () => {
    // Коды взяты из документов сервера, а не угаданы: queued/running/completed/failed/cancelled.
    for (const status of ['queued', 'running', 'completed', 'failed', 'cancelled']) {
      expect(TASK_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('ни одна подпись не написана латиницей', () => {
    const latin = Object.values(TASK_STATUS_LABELS).filter((label) => /[A-Za-z]/.test(label));
    expect(latin).toEqual([]);
  });

  it('незнакомое состояние показывается как есть, а не пропадает', () => {
    expect(taskStatusLabel('какое-то новое')).toBe('какое-то новое');
    expect(taskSourceLabel('новый источник')).toBe('новый источник');
  });
});

describe('что можно сделать с задачей', () => {
  it('повторить можно только упавшую — иначе повтор создаст дубль документа', () => {
    expect(canRetry(task('failed'))).toBe(true);
    expect(canRetry(task('completed'))).toBe(false);
    expect(canRetry(task('queued'))).toBe(false);
  });

  it('отменить можно только то, что ещё не выпущено', () => {
    expect(canCancel(task('queued'))).toBe(true);
    expect(canCancel(task('running'))).toBe(true);
    expect(canCancel(task('completed'))).toBe(false);
    expect(canCancel(task('failed'))).toBe(false);
  });
});

describe('виды документов — один справочник на книгу выдачи и шаблоны', () => {
  it('у каждого вида есть русская подпись', () => {
    const missing = ALL_TEMPLATE_TYPES.filter((type) => !TEMPLATE_TYPE_LABELS[type]);
    expect(missing).toEqual([]);
  });

  it('неизвестный вид не превращается в пустоту', () => {
    expect(templateTypeLabel('невиданный')).toBe('невиданный');
    expect(templateTypeLabel(undefined)).toBe('—');
  });
});
