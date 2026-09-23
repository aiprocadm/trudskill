import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  BulkTasksRequest,
  CreateTaskCommentRequest,
  CreateTaskRequest,
  RescheduleTaskRequest,
  TaskTransitionRequest,
  UpdateTaskRequest
} from './tasks.dto.js';

const errs = (cls: new () => object, raw: unknown) =>
  validateSync(plainToInstance(cls, raw), { whitelist: true, forbidNonWhitelisted: true });

describe('tasks DTO', () => {
  it('CreateTaskRequest: достаточно названия; лишние поля и длинное название — отказ', () => {
    expect(errs(CreateTaskRequest, { title: 'Позвонить' })).toHaveLength(0);
    expect(errs(CreateTaskRequest, {}).length).toBeGreaterThan(0);
    expect(errs(CreateTaskRequest, { title: '' }).length).toBeGreaterThan(0);
    expect(errs(CreateTaskRequest, { title: 'x'.repeat(201) }).length).toBeGreaterThan(0);
    expect(errs(CreateTaskRequest, { title: 'x', status: 'done' }).length).toBeGreaterThan(0);
  });

  it('CreateTaskRequest: вложенные напоминание и ссылки проверяются, файлов не больше 10', () => {
    expect(
      errs(CreateTaskRequest, {
        title: 'x',
        reminder: { minutesBefore: 60, channels: ['push'] },
        links: { groupId: 'grp_1' },
        fileIds: ['f_1'],
        priority: 'high',
        allDay: true,
        dueAt: '2026-10-01T10:00:00.000Z'
      })
    ).toHaveLength(0);
    expect(
      errs(CreateTaskRequest, { title: 'x', reminder: { minutesBefore: -1, channels: [] } }).length
    ).toBeGreaterThan(0);
    expect(errs(CreateTaskRequest, { title: 'x', priority: 'urgent' }).length).toBeGreaterThan(0);
    expect(errs(CreateTaskRequest, { title: 'x', dueAt: 'вчера' }).length).toBeGreaterThan(0);
    expect(
      errs(CreateTaskRequest, {
        title: 'x',
        fileIds: Array.from({ length: 11 }, (_, i) => `f_${i}`)
      }).length
    ).toBeGreaterThan(0);
  });

  it('UpdateTaskRequest: всё необязательно, но пустой список исполнителей — отказ', () => {
    expect(errs(UpdateTaskRequest, {})).toHaveLength(0);
    expect(errs(UpdateTaskRequest, { assigneeIds: [] }).length).toBeGreaterThan(0);
    expect(errs(UpdateTaskRequest, { title: '' }).length).toBeGreaterThan(0);
  });

  it('переход и перенос: комментарий ≤ 5000, даты — ISO', () => {
    expect(errs(TaskTransitionRequest, {})).toHaveLength(0);
    expect(errs(TaskTransitionRequest, { comment: 'x'.repeat(5001) }).length).toBeGreaterThan(0);
    expect(errs(RescheduleTaskRequest, { dueAt: '2026-10-01T10:00:00.000Z' })).toHaveLength(0);
    expect(errs(RescheduleTaskRequest, { dueAt: '01.10.2026' }).length).toBeGreaterThan(0);
  });

  it('комментарий: текст обязателен и ≤ 5000', () => {
    expect(errs(CreateTaskCommentRequest, { text: 'ок', fileId: 'f_1' })).toHaveLength(0);
    expect(errs(CreateTaskCommentRequest, { text: '' }).length).toBeGreaterThan(0);
    expect(errs(CreateTaskCommentRequest, { text: 'x'.repeat(5001) }).length).toBeGreaterThan(0);
  });

  it('массовая операция: 1–100 задач и известное действие', () => {
    expect(errs(BulkTasksRequest, { taskIds: ['t1'], action: 'cancel' })).toHaveLength(0);
    expect(errs(BulkTasksRequest, { taskIds: [], action: 'cancel' }).length).toBeGreaterThan(0);
    expect(errs(BulkTasksRequest, { taskIds: ['t1'], action: 'explode' }).length).toBeGreaterThan(
      0
    );
    expect(
      errs(BulkTasksRequest, {
        taskIds: Array.from({ length: 101 }, (_, i) => `t${i}`),
        action: 'cancel'
      }).length
    ).toBeGreaterThan(0);
  });
});
