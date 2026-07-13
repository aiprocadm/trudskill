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
