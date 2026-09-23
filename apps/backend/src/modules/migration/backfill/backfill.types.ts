/** Домены «JSON → JSON» (stage1-зеркала) и `lms_normalized` — «снимок → нормализованные таблицы» (Фаза 1, срез 0b). */
export type SnapshotBackfillDomain = 'lms' | 'documents';
export type BackfillDomain = SnapshotBackfillDomain | 'lms_normalized';

export type DomainTables = {
  sourceTable: string;
  targetTable: string;
};

export const BACKFILL_DOMAIN_TABLES: Record<SnapshotBackfillDomain, DomainTables> = {
  lms: {
    sourceTable: 'learning.mvp_runtime_documents',
    targetTable: 'learning.mvp_stage1_runtime_documents'
  },
  documents: {
    sourceTable: 'documents.runtime_documents',
    targetTable: 'documents.stage1_runtime_documents'
  }
};

export type BackfillRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type BackfillRunRecord = {
  id: string;
  domain: BackfillDomain;
  status: BackfillRunStatus;
  batch_size: number;
  checkpoint_tenant_id: string | null;
  checkpoint_collection: string | null;
  checkpoint_id: string | null;
  processed_count: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ReconciliationCount = {
  tenant_id: string;
  collection: string;
  source_count: number;
  target_count: number;
};

export type ReconciliationStatusDistribution = {
  tenant_id: string;
  collection: string;
  status: string;
  source_status_count: number;
  target_status_count: number;
};

export type ReconciliationMismatch = {
  tenant_id: string;
  collection: string;
  id: string;
  source_hash: string | null;
  target_hash: string | null;
  reason: 'missing_in_source' | 'missing_in_target' | 'hash_mismatch';
  /** Текст отказа строки (домен `lms_normalized`): почему она не легла в таблицу. */
  error?: string;
};

export type ReconciliationReport = {
  generatedAt: string;
  runId: string;
  domain: BackfillDomain;
  summary: {
    totalCountPartitions: number;
    totalStatusPartitions: number;
    totalMismatches: number;
  };
  counts: ReconciliationCount[];
  statusDistributions: ReconciliationStatusDistribution[];
  missingOrMismatchedRecords: ReconciliationMismatch[];
};
