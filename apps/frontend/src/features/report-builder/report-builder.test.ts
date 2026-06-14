import { describe, expect, it } from 'vitest';

import { base64ToBytes, canRun, setFilter, toRequest, toggleField } from './report-builder';

import type { BuilderState } from './types';

const state = (over: Partial<BuilderState> = {}): BuilderState => ({
  entityKey: 'enrollments',
  selectedFields: ['learnerName'],
  filters: [],
  ...over
});

describe('report-builder pure logic', () => {
  it('canRun requires an entity and at least one field', () => {
    expect(canRun(state())).toBe(true);
    expect(canRun(state({ entityKey: '' }))).toBe(false);
    expect(canRun(state({ selectedFields: [] }))).toBe(false);
  });

  it('toRequest drops blank filters and omits the filters key when none remain', () => {
    const req = toRequest(
      state({
        filters: [
          { key: 'status', value: 'active' },
          { key: 'group', value: '  ' }
        ]
      })
    );
    expect(req.entityKey).toBe('enrollments');
    expect(req.filters).toEqual([{ key: 'status', value: 'active' }]);

    const noFilters = toRequest(state({ filters: [{ key: 'status', value: '' }] }));
    expect(noFilters.filters).toBeUndefined();
  });

  it('toRequest throws when no entity is selected', () => {
    expect(() => toRequest(state({ entityKey: '' }))).toThrow(/entity_not_selected/);
  });

  it('toggleField adds then removes, preserving selection order', () => {
    expect(toggleField(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleField(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('setFilter upserts by key', () => {
    let filters = setFilter([], 'status', 'active');
    expect(filters).toEqual([{ key: 'status', value: 'active' }]);
    filters = setFilter(filters, 'status', 'completed');
    expect(filters).toEqual([{ key: 'status', value: 'completed' }]);
  });

  it('base64ToBytes round-trips bytes', () => {
    // "PK" — first two bytes of any xlsx (zip) file
    const bytes = base64ToBytes('UEs=');
    expect(Array.from(bytes)).toEqual([0x50, 0x4b]);
  });
});
