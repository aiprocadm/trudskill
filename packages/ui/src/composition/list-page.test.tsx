import { describe, expect, it } from 'vitest';

import { AsyncSection } from './async-section.js';
import { ListPage } from './list-page.js';
import { FilterBar } from '../components/filters/index.js';

interface Row {
  id: string;
  name: string;
}
const columns = [{ key: 'name' as const, title: 'Имя' }];

describe('ListPage — каркас списочного экрана', () => {
  it('оборачивает фильтры в FilterBar и тело в AsyncSection', () => {
    const el = ListPage<Row>({
      filters: 'FILTERS',
      columns,
      rows: [{ id: '1', name: 'A' }],
      isLoading: false
    });
    expect(el.props.className).toBe('ui-stack');
    const [filters, async] = el.props.children as any[];
    expect(filters.type).toBe(FilterBar);
    expect(async.type).toBe(AsyncSection);
    expect(async.props.isEmpty).toBe(false);
  });

  it('пустые rows → isEmpty=true у AsyncSection', () => {
    const el = ListPage<Row>({ columns, rows: [], isLoading: false });
    const [filters, async] = el.props.children as any[];
    expect(filters).toBeNull();
    expect(async.props.isEmpty).toBe(true);
  });

  it('действие пустого экрана доходит до AsyncSection (TPL-006)', () => {
    // Пустой реестр обязан говорить, что сделать первым, — иначе человек упирается в тупик.
    const el = ListPage<Row>({
      columns,
      rows: [],
      isLoading: false,
      emptyAction: { label: 'Показать все', onSelect: () => {} }
    });
    const [, async] = el.props.children as any[];
    expect(async.props.emptyAction.label).toBe('Показать все');
  });

  it('без действия свойство не передаётся вовсе (exactOptionalPropertyTypes)', () => {
    const el = ListPage<Row>({ columns, rows: [], isLoading: false });
    const [, async] = el.props.children as any[];
    expect('emptyAction' in async.props).toBe(false);
  });

  it('действия строки уходят в таблицу, а не рисуются внутри данных (CMP-001)', () => {
    const el = ListPage<Row>({
      columns,
      rows: [{ id: '1', name: 'A' }],
      isLoading: false,
      rowActions: () => [{ label: 'Аннулировать', onSelect: () => {} }]
    });
    const [, async] = el.props.children as any[];
    const [table] = async.props.children as any[];
    expect(table.props.rowActions).toBeTypeOf('function');
    expect(table.props.rowActions({ id: '1', name: 'A' })[0].label).toBe('Аннулировать');
  });

  it('пагинация рендерится только при заданных page/totalPages/onPageChange', () => {
    const el = ListPage<Row>({
      columns,
      rows: [{ id: '1', name: 'A' }],
      isLoading: false,
      page: 1,
      totalPages: 3,
      onPageChange: () => {}
    });
    const [, async] = el.props.children as any[];
    const [, pagination] = async.props.children as any[];
    expect(pagination).not.toBeNull();
    expect(pagination.props.totalPages).toBe(3);
  });
});
