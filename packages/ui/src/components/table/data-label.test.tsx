import { describe, expect, it } from 'vitest';

import { DataTable } from './index.js';

import type { Column } from './index.js';
import type { ReactElement, ReactNode } from 'react';

/**
 * ФТ-H4: карточный режим таблицы на телефоне подписывает ячейки через
 * CSS `content: attr(data-label)`. Значит, DataTable обязан проставлять
 * `data-label` из заголовка колонки; колонка без заголовка (действия)
 * атрибута не получает — иначе перед кнопками появлялась бы пустая подпись.
 *
 * Компонент без хуков, поэтому тест обходит дерево элементов напрямую,
 * без DOM-рендера (react-dom в пакете нет намеренно).
 */
type ElementNode = { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };

function isElementNode(node: unknown): node is ElementNode {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node;
}

function collectByTag(node: ReactNode, tag: string, out: ElementNode[] = []): ElementNode[] {
  if (Array.isArray(node)) {
    for (const child of node) collectByTag(child, tag, out);
    return out;
  }
  if (!isElementNode(node)) return out;
  if (node.type === tag) out.push(node);
  collectByTag(node.props.children ?? null, tag, out);
  return out;
}

type Row = { num: string; actions: string };

const columns: Column<Row>[] = [
  { key: 'num', title: '№ документа' },
  { key: 'actions', title: '' }
];

describe('DataTable data-label (ФТ-H4)', () => {
  it('ячейка получает data-label из заголовка колонки', () => {
    const tree = DataTable<Row>({ columns, rows: [{ num: '01-2026', actions: 'x' }] });
    const cells = collectByTag(tree as ReactElement as ReactNode, 'td');
    expect(cells).toHaveLength(2);
    expect(cells[0]!.props['data-label']).toBe('№ документа');
  });

  it('колонка без заголовка остаётся без data-label', () => {
    const tree = DataTable<Row>({ columns, rows: [{ num: '01-2026', actions: 'x' }] });
    const cells = collectByTag(tree as ReactElement as ReactNode, 'td');
    expect('data-label' in cells[1]!.props).toBe(false);
  });

  it('ячейка «нет данных» остаётся без data-label', () => {
    const tree = DataTable<Row>({ columns, rows: [] });
    const cells = collectByTag(tree as ReactElement as ReactNode, 'td');
    expect(cells).toHaveLength(1);
    expect('data-label' in cells[0]!.props).toBe(false);
  });
});
