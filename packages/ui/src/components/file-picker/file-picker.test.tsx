import { describe, expect, it, vi } from 'vitest';

import { FilePicker } from './index.js';

import type { ChangeEvent, ReactElement } from 'react';

/*
 * В пакете нет RTL (RISK-002): компонент вызывается как функция, структура
 * проверяется по свойствам элементов — как у остальных компонентов пакета.
 */

type Node = ReactElement & { props: Record<string, unknown> };

const render = (props: Parameters<typeof FilePicker>[0]) => FilePicker(props) as Node;

const childrenOf = (node: Node): Node[] =>
  (Array.isArray(node.props.children) ? node.props.children : [node.props.children]).filter(
    Boolean
  ) as Node[];

const makeChangeEvent = (file: File | null): ChangeEvent<HTMLInputElement> =>
  ({
    target: { files: file ? [file] : [], value: 'C:\\fakepath\\x' }
  }) as unknown as ChangeEvent<HTMLInputElement>;

describe('FilePicker', () => {
  it('настоящий input скрыт классом, но несёт подпись для скринридера', () => {
    const node = render({ ariaLabel: 'Файл со списком', onSelect: () => {} });
    const [input] = childrenOf(node);
    expect(input?.props.type).toBe('file');
    expect(input?.props.className).toBe('ui-file-picker__input');
    expect(input?.props['aria-label']).toBe('Файл со списком');
  });

  it('кнопка по умолчанию называется по-русски, имя файла показывается по запросу', () => {
    const idle = render({ ariaLabel: 'x', onSelect: () => {}, fileName: null });
    const [, button, name] = childrenOf(idle);
    expect(button?.props.children).toBe('Выбрать файл');
    expect(name?.props.children).toBe('Файл не выбран');

    const chosen = render({ ariaLabel: 'x', onSelect: () => {}, fileName: 'список.xlsx' });
    const nameNode = childrenOf(chosen)[2];
    expect(nameNode?.props.children).toBe('список.xlsx');

    // Без свойства fileName строка не рисуется вовсе (экраны с мгновенной загрузкой).
    const silent = render({ ariaLabel: 'x', onSelect: () => {} });
    expect(childrenOf(silent)).toHaveLength(2);
  });

  it('onSelect получает выбранный файл; resetAfterSelect очищает значение', () => {
    const onSelect = vi.fn();
    const node = render({ ariaLabel: 'x', onSelect, resetAfterSelect: true });
    const [input] = childrenOf(node);
    const file = new File(['a'], 'отчёт.xlsx');
    const event = makeChangeEvent(file);
    (input?.props.onChange as (e: ChangeEvent<HTMLInputElement>) => void)(event);
    expect(onSelect).toHaveBeenCalledWith(file);
    expect(event.target.value).toBe('');

    const empty = makeChangeEvent(null);
    (input?.props.onChange as (e: ChangeEvent<HTMLInputElement>) => void)(empty);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('disabled уходит на настоящий input — кнопка гаснет через CSS-соседство', () => {
    const node = render({ ariaLabel: 'x', onSelect: () => {}, disabled: true });
    const [input] = childrenOf(node);
    expect(input?.props.disabled).toBe(true);
  });
});
