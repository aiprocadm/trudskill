CREATE TABLE IF NOT EXISTS documents.runtime_documents (
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_runtime_documents_pk PRIMARY KEY (tenant_id, collection, id)
);

CREATE INDEX IF NOT EXISTS documents_runtime_documents_tenant_collection_idx
  ON documents.runtime_documents (tenant_id, collection);
