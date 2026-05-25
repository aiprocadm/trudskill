-- 0033_documents_qr_token.sql
-- Pillar A Plan C §5.8 — qr_token для публичной QR-проверки подлинности.
--
-- Колонка nullable: backfill для legacy документов (Plan A/B) не делаем —
-- они выпускались без qr_token, поэтому verify endpoint вернёт для них 404
-- (legacy документы не имеют QR на бумажной копии — это согласовано со spec).
-- Новые документы получают qr_token в сервисе (crypto.randomBytes(16)).
--
-- Partial unique index `WHERE qr_token IS NOT NULL` allows множество NULL
-- (legacy) и enforces uniqueness только для активных токенов.

ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS qr_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_documents_qr_token
  ON documents.generated_documents (qr_token)
  WHERE qr_token IS NOT NULL;
