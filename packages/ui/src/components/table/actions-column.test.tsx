import { describe, expect, it } from 'vitest';

import { DataTable } from './index.js';

import type { Column } from './index.js';
import type { ReactElement, ReactNode } from 'react';

/**
 * ТЗ 5.2 (Э2): недоступное действие скрывается, а не показывается вхолостую.
 *
 * У руководителя без прав на бланки и выпуск таблица шаблонов рисовала пустую колонку
 * «Действия»: `rowActions` передан, но для каждой строки возвращает `[]`. Колонка появляется,
 * только если хоть у одной строки действия есть.
 *
 * Компонент без хуков — дерево обходится напрямую, без DOM (react-dom в пакете нет намеренно).
 */
type ElementNode = { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };

const isElementNode = (node: unknown): node is ElementNode =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node;

const collectByClass = (
  node: ReactNode,
  className: string,
  out: ElementNode[] = []
): ElementNode[] => {
  if (Array.isArray(node)) {
    for (const child of node) collectByClass(child, className, out);
    return out;
  }
  if (!isElementNode(node)) return out;
  if (
    String(node.props.className ?? '')
      .split(' ')
      .includes(className)
  )
    out.push(node);
  collectByClass(node.props.children ?? null, className, out);
  return out;
};

type Row = { id: string; name: string };
const columns: Column<Row>[] = [{ key: 'name', title: 'Шаблон' }];
const rows: Row[] = [
  { id: 't1', name: 'Удостоверение' },
  { id: 't2', name: 'Протокол' }
];

const render = (props: Partial<Parameters<typeof DataTable<Row>>[0]>): ReactElement =>
  DataTable<Row>({ columns, rows, rowKey: (r) => r.id, ...props });

describe('DataTable — колонка действий по наличию действий (ТЗ 5.2)', () => {
  it('ни у одной строки нет действий — колонки «Действия» нет', () => {
    const tree = render({ rowActions: () => [] });
    expect(collectByClass(tree, 'ui-table-actions')).toHaveLength(0);
  });

  it('хоть у одной строки есть действие — колонка есть у всех строк', () => {
    const tree = render({
      rowActions: (r) =>
        r.id === 't2' ? [{ label: 'Настроить бланк', onSelect: () => undefined }] : []
    });
    const cells = collectByClass(tree, 'ui-table-actions');
    /* Заголовок колонки + ячейка в каждой из двух строк. */
    expect(cells.filter((node) => node.type === 'th')).toHaveLength(1);
    expect(cells.filter((node) => node.type === 'td')).toHaveLength(2);
  });

  it('без rowActions колонки нет — как и раньше', () => {
    expect(collectByClass(render({}), 'ui-table-actions')).toHaveLength(0);
  });
});
