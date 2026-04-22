export type BackfillDomain = 'lms' | 'documents';

export type DomainTables = {
  sourceTable: string;
  targetTable: string;
};

export const BACKFILL_DOMAIN_TABLES: Record<BackfillDomain, DomainTables> = {
  lms: {
    sourceTable: 'learning.mvp_runtime_documents',
    targetTable: 'learning.mvp_stage1_runtime_documents'
  },
  documents: {
    sourceTable: 'documents.runtime_documents',
    targetTable: 'documents.stage1_runtime_documents'
  }
};

export type BackfillRunRecord = {
  id: string;
  domain: BackfillDomain;
  status: 'pending' | 'running' | 'completed' | 'failed';
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
