/**
 * Phase 10 Track A — pure report engine.
 *
 * Filters tenant-scoped rows by the chosen filters, projects them onto the chosen
 * fields (in order), caps to `limit` for previews, and reports the pre-cap `total`.
 * No DI, no I/O — directly unit-testable.
 */
import type {
  ReportCellValue,
  ReportColumn,
  ReportEntityDef,
  ReportFilterValue,
  ResolveCtx
} from './report-types.js';

export interface BuildReportInput {
  entity: ReportEntityDef;
  selectedFields: string[];
  filters: ReportFilterValue[];
  rows: unknown[];
  ctx: ResolveCtx;
  /** Optional row cap (preview). Omit for a full export. */
  limit?: number;
}

export interface BuildReportResult {
  columns: ReportColumn[];
  rows: Record<string, ReportCellValue>[];
  /** Number of rows matching the filters, before any `limit` cap. */
  total: number;
  /** true when the result was capped by `limit`. */
  truncated: boolean;
}

export function buildReport(input: BuildReportInput): BuildReportResult {
  const { entity, selectedFields, filters, rows, ctx, limit } = input;

  if (selectedFields.length === 0) {
    throw new Error('no_fields_selected');
  }

  const fieldDefs = selectedFields.map((key) => {
    const def = entity.fields.find((f) => f.key === key);
    if (!def) throw new Error(`unknown_field:${key}`);
    return def;
  });

  const filterDefs = filters.map((fv) => {
    const def = entity.filters.find((f) => f.key === fv.key);
    if (!def) throw new Error(`unknown_filter:${fv.key}`);
    return { def, value: fv.value };
  });

  const matched = rows.filter((row) =>
    // a blank filter value is a no-op (filter left empty in the UI)
    filterDefs.every(({ def, value }) => value === '' || def.apply(row, value, ctx))
  );
  const total = matched.length;

  const capped = typeof limit === 'number' ? matched.slice(0, limit) : matched;
  const projected = capped.map((row) =>
    fieldDefs.reduce<Record<string, ReportCellValue>>((acc, def) => {
      acc[def.key] = def.resolve(row, ctx);
      return acc;
    }, {})
  );

  return {
    columns: fieldDefs.map((d) => ({ key: d.key, header: d.header, type: d.type })),
    rows: projected,
    total,
    truncated: typeof limit === 'number' && total > capped.length
  };
}
