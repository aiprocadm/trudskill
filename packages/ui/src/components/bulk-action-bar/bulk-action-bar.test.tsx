import { describe, expect, it } from 'vitest';

import { BulkActionBar } from './index.js';
import { propsOf } from '../../testing/element.test-util.js';

import type { ReactElement } from 'react';

const noop = () => {};

/*
 * ТЗ 5.5 (Э5): панель висит над страницей, поэтому компонент возвращает ДВА узла — саму
 * панель и распорку, оставляющую под неё место в потоке. Тесты смотрят на первый.
 */
const barOf = (node: unknown): ReactElement => (propsOf(node).children as ReactElement[])[0]!;

describe('панель массовых действий (CMP-011)', () => {
  it('не рендерится, когда ничего не выделено и нечего показать', () => {
    expect(BulkActionBar({ selectedCount: 0, actions: [], onClear: noop })).toBeNull();
  });

  it('показывает число выделенных строк', () => {
    const bar = BulkActionBar({ selectedCount: 12, actions: [], onClear: noop }) as ReactElement;
    const [row] = propsOf(barOf(bar)).children as ReactElement[];
    const [count] = propsOf(row).children as ReactElement[];
    expect(propsOf(count).children).toEqual(['Выделено: ', 12]);
  });

  it('опасное действие оформляется отдельно', () => {
    const bar = BulkActionBar({
      selectedCount: 1,
      actions: [{ label: 'Архивировать', onSelect: noop, danger: true }],
      onClear: noop
    }) as ReactElement;
    const [row] = propsOf(barOf(bar)).children as ReactElement[];
    const [, buttons] = propsOf(row).children as ReactElement[][];
    expect(propsOf(buttons?.[0]).className).toBe('ui-button-danger');
  });

  it('во время выполнения действия заблокированы — повторное нажатие невозможно', () => {
    const bar = BulkActionBar({
      selectedCount: 3,
      actions: [{ label: 'Архивировать', onSelect: noop }],
      onClear: noop,
      isRunning: true
    }) as ReactElement;
    const [row] = propsOf(barOf(bar)).children as ReactElement[];
    const [, buttons] = propsOf(row).children as ReactElement[][];
    expect(propsOf(buttons?.[0]).disabled).toBe(true);
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
    const [, outcome] = propsOf(barOf(bar)).children as ReactElement[];
    const rendered = JSON.stringify(outcome);
    expect(rendered).toContain('Иванов И. И.');
    expect(rendered).toContain('нет СНИЛС');
  });

  it('опасное действие печатается ПОСЛЕДНИМ, за полезными (ТЗ 5.5 / Э5)', () => {
    /*
     * Порядок расставляет компонент: экран передал «Архивировать» первым, а человек обязан
     * увидеть его последним — иначе красная кнопка стоит там, куда целятся, промахнувшись.
     */
    const bar = BulkActionBar({
      selectedCount: 4,
      actions: [
        { label: 'Архивировать', onSelect: noop, danger: true },
        { label: 'Добавить в группу', onSelect: noop },
        { label: 'Выгрузить выбранных', onSelect: noop }
      ],
      onClear: noop
    }) as ReactElement;
    const [row] = propsOf(barOf(bar)).children as ReactElement[];
    const [, buttons] = propsOf(row).children as ReactElement[][];
    expect(buttons?.map((button) => propsOf(button).children)).toEqual([
      'Добавить в группу',
      'Выгрузить выбранных',
      'Архивировать'
    ]);
    expect(propsOf(buttons?.[2]).className).toBe('ui-button-danger');
  });

  it('под панель остаётся место в потоке — она не накрывает последние строки списка', () => {
    const node = BulkActionBar({
      selectedCount: 1,
      actions: [{ label: 'Выгрузить', onSelect: noop }],
      onClear: noop
    }) as ReactElement;
    const [, spacer] = propsOf(node).children as ReactElement[];
    expect(propsOf(spacer).className).toBe('ui-bulk-bar-spacer');
    expect(propsOf(spacer)['aria-hidden'], 'распорка — не содержимое для незрячих').toBe(true);
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
