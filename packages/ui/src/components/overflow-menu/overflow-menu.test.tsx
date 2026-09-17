import { describe, expect, it, vi } from 'vitest';

import { OverflowMenu } from './index.js';
import { childrenOf, handlerOf, propsOf } from '../../testing/element.test-util.js';

/*
 * В пакете нет RTL (RISK-002): компонент вызывается как функция, структура проверяется по
 * свойствам элементов — как у остальных компонентов пакета.
 */

const noop = () => undefined;

/* Дети списка — вложенные массивы (`safe.map`, разделитель, `danger.map`): разворачиваем. */
const flatten = (nodes: unknown[]): unknown[] =>
  nodes.flatMap((node) => (Array.isArray(node) ? flatten(node) : [node])).filter(Boolean);

const listOf = (el: ReturnType<typeof OverflowMenu>) => {
  const [, list] = childrenOf(el!);
  return flatten(childrenOf(list) as unknown[]);
};

describe('OverflowMenu — меню «…» (CMP-001, ТЗ 5.1)', () => {
  it('кнопка-вызов подписана для незрячих, список — меню', () => {
    const el = OverflowMenu({ items: [{ label: 'Сменить тариф', onSelect: noop }] });
    const [summary, list] = childrenOf(el!);
    expect(propsOf(el!).className).toBe('ui-overflow-menu');
    expect(propsOf(summary)['aria-label']).toBe('Ещё действия');
    expect(propsOf(summary).className).toContain('ui-button--ghost');
    expect(propsOf(list).role).toBe('menu');
  });

  it('опасные пункты — внизу, отдельной секцией, красным', () => {
    const el = OverflowMenu({
      items: [
        { label: 'Приостановить центр', onSelect: noop, danger: true },
        { label: 'Сменить тариф', onSelect: noop },
        { label: 'Войти от имени', onSelect: noop }
      ]
    });
    const rows = listOf(el);
    expect(rows.map((r) => propsOf(r).children ?? propsOf(r).role)).toEqual([
      'Сменить тариф',
      'Войти от имени',
      'separator',
      'Приостановить центр'
    ]);
    expect(propsOf(rows[3]).className).toContain('ui-overflow-menu__item--danger');
    expect(propsOf(rows[2]).className).toBe('ui-overflow-menu__divider');
  });

  it('без обычных пунктов разделитель не рисуется', () => {
    const el = OverflowMenu({ items: [{ label: 'В архив', onSelect: noop, danger: true }] });
    expect(listOf(el).map((r) => propsOf(r).role)).toEqual(['menuitem']);
  });

  it('пустой список — меню нет вовсе', () => {
    expect(OverflowMenu({ items: [] })).toBeNull();
  });

  it('пункт вызывает действие; выключенный пункт помечен disabled', () => {
    const onSelect = vi.fn();
    const el = OverflowMenu({
      items: [
        { label: 'Открыть', onSelect },
        { label: 'Сменить тариф', onSelect: noop, disabled: true }
      ]
    });
    const [first, second] = listOf(el);
    handlerOf(first, 'onClick')();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(propsOf(second).disabled).toBe(true);
  });
});
