/**
 * Phase 10 Track A — UI types for the Excel report builder.
 * Mirrors packages/api-contracts/src/domains/mvp-metrics (report-builder block);
 * duplicated locally per the codebase convention (see recertification/types.ts).
 */
export type ReportEntityKey = 'learners' | 'enrollments';
export type ReportFieldType = 'string' | 'number' | 'date' | 'enum';

export interface ReportFieldMeta {
  key: string;
  header: string;
  type: string;
}

export interface ReportFilterMeta {
  key: string;
  label: string;
  kind: string;
  type: string;
}

export interface ReportEntityMeta {
  key: string;
  label: string;
  fields: ReportFieldMeta[];
  filters: ReportFilterMeta[];
}

export interface ReportEntitiesMeta {
  entities: ReportEntityMeta[];
}

export interface ReportFilterValue {
  key: string;
  value: string;
}

export interface BuildReportRequest {
  entityKey: ReportEntityKey;
  selectedFields: string[];
  filters?: ReportFilterValue[];
}

export interface ReportColumn {
  key: string;
  header: string;
  type: ReportFieldType;
}

export interface ReportPreview {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  total: number;
  truncated: boolean;
}

export interface ReportExport {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface ReportTemplate {
  id: string;
  tenantId: string;
  name: string;
  entityKey: ReportEntityKey;
  selectedFields: string[];
  filters: ReportFilterValue[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveReportTemplateRequest extends BuildReportRequest {
  id?: string;
  name: string;
}

/** Local UI editing state for the builder form. */
export interface BuilderState {
  entityKey: ReportEntityKey | '';
  selectedFields: string[];
  filters: ReportFilterValue[];
}
