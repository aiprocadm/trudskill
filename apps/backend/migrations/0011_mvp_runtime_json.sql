-- JSON-backed runtime store for MVP domain entities (bridges TS model to PostgreSQL until full relational mapping).
CREATE TABLE IF NOT EXISTS learning.mvp_runtime_documents (
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_runtime_documents_pk PRIMARY KEY (tenant_id, collection, id)
);

CREATE INDEX IF NOT EXISTS mvp_runtime_documents_tenant_collection_idx
  ON learning.mvp_runtime_documents (tenant_id, collection);
