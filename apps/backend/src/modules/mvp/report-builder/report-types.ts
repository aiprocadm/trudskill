/**
 * Phase 10 Track A — Excel report builder shared types.
 *
 * The entity registry (report-entities.ts) and the pure engine (build-report.ts)
 * are the single source of truth for "which entities/fields/filters exist". v1 ships
 * two MVP-state-native entities (learners, enrollments); the cross-module `documents`
 * entity is deferred (see spec §11 / handoff deviation D-A5).
 */
export type ReportFieldType = 'string' | 'number' | 'date' | 'enum';
export type ReportEntityKey = 'learners' | 'enrollments';
export type ReportCellValue = string | number | null;

/** Resolver maps shared across all field/filter resolvers (built per-request, tenant-scoped). */
export interface ResolveCtx {
  courseTitleById: Map<string, string>;
  groupById: Map<string, { name: string; counterpartyId?: string }>;
  clientNameById: Map<string, string>;
  learnerNameById: Map<string, string>;
  /** enrollmentId → progressPercent (0..100). */
  courseProgressByEnrollment: Map<string, number>;
}

export interface ReportFieldDef<Row = unknown> {
  key: string;
  header: string;
  type: ReportFieldType;
  resolve: (row: Row, ctx: ResolveCtx) => ReportCellValue;
}

export type ReportFilterKind = 'eq' | 'date_from' | 'date_to';

export interface ReportFilterDef<Row = unknown> {
  key: string;
  label: string;
  kind: ReportFilterKind;
  type: ReportFieldType;
  /** Returns true if the row passes the filter for the given (non-empty) value. */
  apply: (row: Row, value: string, ctx: ResolveCtx) => boolean;
}

export interface ReportEntityDef<Row = unknown> {
  key: ReportEntityKey;
  label: string;
  fields: ReportFieldDef<Row>[];
  filters: ReportFilterDef<Row>[];
}

export interface ReportFilterValue {
  key: string;
  value: string;
}

export interface ReportColumn {
  key: string;
  header: string;
  type: ReportFieldType;
}
