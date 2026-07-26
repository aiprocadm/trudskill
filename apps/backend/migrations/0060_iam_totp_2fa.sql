-- 0060: 2FA (TOTP) для админских ролей — ФТ-G3, Фаза 0 Task 5 дельта-ТЗ «Арендная СДО».
-- Аддитивно и идемпотентно: три колонки на iam.users.
--   totp_secret_encrypted — секрет RFC 6238 в шифре AES-256-GCM (тот же application-crypto,
--     что у секретов интеграций: формат enc:<ver>:<iv>:<tag>:<ct>, ключи INTEGRATION_CRYPTO_KEYS);
--   totp_enabled          — 2FA подтверждена кодом и активна (сам факт наличия секрета — ещё нет:
--     между setup и confirm секрет лежит с totp_enabled=false);
--   totp_last_used_step   — последний принятый 30-секундный шаг TOTP: повторный ввод того же
--     кода в его окне отклоняется (anti-replay, RFC 6238 §5.2).
alter table iam.users add column if not exists totp_secret_encrypted text;
alter table iam.users add column if not exists totp_enabled boolean not null default false;
alter table iam.users add column if not exists totp_last_used_step bigint;
