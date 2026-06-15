import { describe, expect, it, vi } from 'vitest';

import { REGISTRY_SOURCE_PAGE_SIZE, collectAllPages } from './registry-pagination.js';

describe('collectAllPages', () => {
  it('exhausts a paged source larger than one page (>1000 candidates)', () => {
    // 1500 source rows behind a real-slicing pager — proves the loop does not stop
    // at the first page (the old hard-coded `page_size: 1000` truncation bug).
    const source = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
    const fetchPage = vi.fn((page: number, pageSize: number) => ({
      items: source.slice((page - 1) * pageSize, page * pageSize),
      total: source.length
    }));

    const all = collectAllPages(fetchPage);

    expect(all).toHaveLength(1500);
    expect(all.map((r) => r.id)).toEqual(source.map((r) => r.id));
    // 1500 rows / 1000 page size → exactly 2 fetches.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, REGISTRY_SOURCE_PAGE_SIZE);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, REGISTRY_SOURCE_PAGE_SIZE);
  });

  it('stops after one fetch when the source is shorter than a page and reports no total', () => {
    // Mirrors the fully-mocked service tests whose stubs return `{ items }` with no `total`.
    // A short page must terminate the loop — never re-fetch a constant-return stub forever.
    const fetchPage = vi.fn(() => ({ items: [{ id: 'a' }, { id: 'b' }] }));

    const all = collectAllPages(fetchPage);

    expect(all).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('does not fetch an extra empty page when total is an exact multiple of the page size', () => {
    const source = Array.from({ length: 2000 }, (_, i) => ({ id: i }));
    const fetchPage = vi.fn((page: number, pageSize: number) => ({
      items: source.slice((page - 1) * pageSize, page * pageSize),
      total: source.length
    }));

    const all = collectAllPages(fetchPage);

    expect(all).toHaveLength(2000);
    // total (2000) is reached after page 2 → no wasteful third fetch.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('terminates on an empty page when total is absent and the previous page was full', () => {
    // A stub that returns a full page then an empty one (no `total`) must still stop.
    const pages = [Array.from({ length: REGISTRY_SOURCE_PAGE_SIZE }, (_, i) => ({ id: i })), []];
    const fetchPage = vi.fn((page: number) => ({ items: pages[page - 1] ?? [] }));

    const all = collectAllPages(fetchPage);

    expect(all).toHaveLength(REGISTRY_SOURCE_PAGE_SIZE);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
