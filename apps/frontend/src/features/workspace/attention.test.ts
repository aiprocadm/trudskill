import { describe, expect, it } from 'vitest';

import { buildAttentionItems } from './attention';

import type { WorkspaceBlockerItem, WorkspaceTaskItem } from './types';

const task = (over: Partial<WorkspaceTaskItem> & { id: string }): WorkspaceTaskItem => ({
  title: `Задача ${over.id}`,
  status: 'open',
  route: `/tasks/${over.id}`,
  ...over
});

const blocker = (over: Partial<WorkspaceBlockerItem> & { id: string }): WorkspaceBlockerItem => ({
  title: `Блокер ${over.id}`,
  severity: 'medium',
  route: `/blockers/${over.id}`,
  ...over
});

describe('очередь «Разобрать» на оперативной панели (IA-016)', () => {
  it('сводит блокеры и просроченные задачи в один список', () => {
    const items = buildAttentionItems(
      [task({ id: 't1', status: 'overdue' })],
      [blocker({ id: 'b1' })]
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.kind)).toEqual(['блокер', 'просроченная задача']);
  });

  it('задачи в работе и открытые в очередь не попадают', () => {
    // Очередь — это то, что горит. Полный список задач остаётся ниже на странице.
    const items = buildAttentionItems(
      [task({ id: 'open' }), task({ id: 'wip', status: 'in_progress' })],
      []
    );
    expect(items).toEqual([]);
  });

  it('идентификаторы не сталкиваются между источниками', () => {
    // У задачи и блокера может быть одинаковый id — без префикса React отрисует
    // список с дублирующимися ключами и начнёт терять строки при обновлении.
    const items = buildAttentionItems(
      [task({ id: 'same', status: 'overdue' })],
      [blocker({ id: 'same' })]
    );
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it('срок задачи переносится в очередь — по нему считается просрочка', () => {
    const items = buildAttentionItems(
      [task({ id: 't1', status: 'overdue', dueAt: '2026-08-01T00:00:00Z' })],
      []
    );
    expect(items[0]?.dueAt).toBe('2026-08-01T00:00:00Z');
  });

  it('критичность блокера сохраняется — от неё зависит порядок', () => {
    const items = buildAttentionItems([], [blocker({ id: 'b1', severity: 'high' })]);
    expect(items[0]?.severity).toBe('high');
  });

  it('пустые источники дают пустую очередь, а не ошибку', () => {
    expect(buildAttentionItems([], [])).toEqual([]);
  });
});
