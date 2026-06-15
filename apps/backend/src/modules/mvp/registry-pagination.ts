/**
 * Shared pagination exhaustion helper for the regulatory registry exporters
 * (ОТ / ФРДО / ЕИСОТ / Ростехнадзор / Минздрав-НМО).
 *
 * Each exporter sources its candidate rows from a paged `list*` call. Previously
 * they passed a hard-coded `page_size: 1000` and took a single page, so a tenant
 * with >1000 candidates in the filter window produced a SILENTLY truncated export —
 * a correctness risk for a regulatory submission. This helper loops over every page
 * until the source is exhausted so no candidate is ever dropped.
 *
 * Termination is robust to two source shapes used across the suite:
 *   - real `MvpService.list()` / `DocumentsService.listIssuedDocuments()` which
 *     return a truthful `total` → we stop once `collected >= total`;
 *   - fully-mocked service stubs that return `{ items }` with no `total` → we stop
 *     on the first short/empty page (a page smaller than `pageSize` is the last one).
 */

/** The page size used when exhausting a registry source. */
export const REGISTRY_SOURCE_PAGE_SIZE = 1000;

export interface RegistrySourcePage<T> {
  items: T[];
  total?: number;
}

/**
 * Repeatedly invokes `fetchPage(page, pageSize)` from page 1, accumulating every
 * item, until the source is exhausted. Returns the full, untruncated list.
 */
export function collectAllPages<T>(
  fetchPage: (page: number, pageSize: number) => RegistrySourcePage<T>,
  pageSize: number = REGISTRY_SOURCE_PAGE_SIZE
): T[] {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const { items, total } = fetchPage(page, pageSize);
    all.push(...items);
    const lastPage = items.length < pageSize || (typeof total === 'number' && all.length >= total);
    if (lastPage) break;
  }
  return all;
}
