import { describe, expect, it } from 'vitest';

import { BulkActionBar } from './index.js';

import type { ReactElement } from 'react';

const noop = () => {};

describe('панель массовых действий (CMP-011)', () => {
  it('не рендерится, когда ничего не выделено и нечего показать', () => {
    expect(BulkActionBar({ selectedCount: 0, actions: [], onClear: noop })).toBeNull();
  });

  it('показывает число выделенных строк', () => {
    const bar = BulkActionBar({ selectedCount: 12, actions: [], onClear: noop }) as ReactElement;
    const [row] = bar.props.children as ReactElement[];
    const [count] = row.props.children as ReactElement[];
    expect(count.props.children).toEqual(['Выделено: ', 12]);
  });

  it('опасное действие оформляется отдельно', () => {
    const bar = BulkActionBar({
      selectedCount: 1,
      actions: [{ label: 'Архивировать', onSelect: noop, danger: true }],
      onClear: noop
    }) as ReactElement;
    const [row] = bar.props.children as ReactElement[];
    const [, buttons] = row.props.children as ReactElement[][];
    expect(buttons[0]?.props.className).toBe('ui-button-danger');
  });

  it('во время выполнения действия заблокированы — повторное нажатие невозможно', () => {
    const bar = BulkActionBar({
      selectedCount: 3,
      actions: [{ label: 'Архивировать', onSelect: noop }],
      onClear: noop,
      isRunning: true
    }) as ReactElement;
    const [row] = bar.props.children as ReactElement[];
    const [, buttons] = row.props.children as ReactElement[][];
    expect(buttons[0]?.props.disabled).toBe(true);
  });

  it('частичный успех показывает отказы ПОИМЁННО с причиной', () => {
    // Обязательное состояние по ТЗ: сводка «12 из 15» без имён не отвечает на вопрос,
    // что случилось с остальными тремя.
    const bar = BulkActionBar({
      selectedCount: 0,
      actions: [],
      onClear: noop,
      outcome: {
        total: 3,
        succeeded: 2,
        failures: [{ label: 'Иванов И. И.', reason: 'нет СНИЛС' }]
      }
    }) as ReactElement;
    const [, outcome] = bar.props.children as ReactElement[];
    const rendered = JSON.stringify(outcome);
    expect(rendered).toContain('Иванов И. И.');
    expect(rendered).toContain('нет СНИЛС');
  });

  it('панель остаётся видимой после операции, чтобы итог можно было прочитать', () => {
    const bar = BulkActionBar({
      selectedCount: 0,
      actions: [],
      onClear: noop,
      outcome: { total: 2, succeeded: 2, failures: [] }
    });
    expect(bar).not.toBeNull();
  });
});
