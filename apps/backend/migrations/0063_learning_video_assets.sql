-- 0063_learning_video_assets.sql
-- Фаза 2 «Видео и часы», Task 1 (ФТ-B1.1) — шов VideoProvider и сущность видео-ассета.
--   * learning.video_assets — загруженное видео со своим жизненным циклом
--     (uploading → processing → ready | failed), длительностью и размером.
--   * learning.video_provider_settings — per-tenant выбор провайдера, ТОЛЬКО несекретная
--     конфигурация (секреты — в секрет-хранилище). Форма скопирована с 0055 (вебинары).
--   * права video.read / video.write / video.configure.
--
-- Почему отдельная таблица, а не колонки в learning.materials: у видео свой жизненный цикл,
-- размер, длительность и идентификатор на стороне провайдера — вшивать это в материал значит
-- переделывать его таблицу при каждой смене провайдера. Материал ссылается на ассет;
-- material_type='video' в materials_type_chk существует с 0052.
--
-- Additive + idempotent. Runtime MVP state persists as a JSONB snapshot; these typed
-- columns are the schema contract (0016 rule). Mirror of 0052/0055.

BEGIN;

CREATE TABLE IF NOT EXISTS learning.video_assets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  -- Ассет создаётся ДО привязки к уроку (методист сначала льёт файл), поэтому null допустим.
  material_id text NULL,
  provider_code text NOT NULL DEFAULT 'noop',
  -- Идентификатор ассета на стороне провайдера; для self-hosted остаётся null.
  provider_asset_id text NULL,
  status text NOT NULL DEFAULT 'uploading',
  -- Длительность известна только после обработки — до неё null, и прогресс по проценту
  -- просмотра считать нельзя (ФТ-B3.1 опирается на это поле).
  duration_seconds integer NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  -- Ключ в S3 для self-hosted ветки; для провайдера остаётся null.
  storage_key text NULL,
  -- Человекочитаемая причина отказа: методист должен видеть текст, а не вечное «обрабатывается».
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_assets_status_chk
    CHECK (status IN ('uploading', 'processing', 'ready', 'failed'))
);

-- Основной запрос — «видео этого урока у этого тенанта»; tenant_id первым, потому что
-- он есть в каждом запросе (инвариант изоляции, ФТ-D1).
CREATE INDEX IF NOT EXISTS idx_video_assets_tenant_material
  ON learning.video_assets (tenant_id, material_id);

-- Вебхук провайдера приходит со СВОИМ идентификатором и без tenant_id — по нему и ищем.
CREATE INDEX IF NOT EXISTS idx_video_assets_provider_asset_id
  ON learning.video_assets (provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS learning.video_provider_settings (
  tenant_id text PRIMARY KEY,
  provider_code text NOT NULL DEFAULT 'noop',
  base_url text NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE learning.video_provider_settings IS
  'Фаза 2 Task 1: per-tenant видео-провайдер. ТОЛЬКО несекретная конфигурация — ключи и токены живут в секрет-хранилище.';

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_video_read', 'video.read', 'Read video assets and obtain playback source'),
  ('p_video_write', 'video.write', 'Upload and manage video assets'),
  ('p_video_configure', 'video.configure', 'Configure the tenant video provider')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND (
    -- Слушателю нужен только просмотр: загрузка и настройка — не его роль.
    (p.code = 'video.read' AND r.code IN ('platform_admin', 'tenant_admin', 'methodist', 'learner'))
    OR (p.code = 'video.write' AND r.code IN ('platform_admin', 'tenant_admin', 'methodist'))
    OR (p.code = 'video.configure' AND r.code IN ('platform_admin', 'tenant_admin'))
  )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
