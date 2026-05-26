-- 0034_documents_revoke_reissue.sql
-- Pillar A Plan C §5.9 — аннулирование и перевыпуск документов.
--
-- 5 новых nullable колонок на documents.generated_documents:
--   revoked_at, revoked_by — кто и когда аннулировал.
--   revocation_reason — обязательное поле в UI, проверяется на уровне сервиса.
--   replaces_document_id — id оригинала, если этот документ — перевыпуск.
--   replaced_by_document_id — id перевыпуска, заполняется на оригинале.
--
-- Status — text без CHECK; runtime-валидация в сервисе. Расширяем enum
-- значением 'revoked' на уровне TS-типа (GeneratedDocumentStatus).
--
-- Partial index по revoked_at — для быстрого 'show me revoked docs in tenant X'.

ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by text,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS replaces_document_id text,
  ADD COLUMN IF NOT EXISTS replaced_by_document_id text;

CREATE INDEX IF NOT EXISTS idx_generated_documents_revoked
  ON documents.generated_documents (tenant_id, revoked_at DESC)
  WHERE revoked_at IS NOT NULL;
