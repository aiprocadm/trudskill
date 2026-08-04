-- Фаза 4 Task 10 (ФТ-D6): библиотека курсов платформы.
--
-- Каталог курсов, которые владелец платформы предлагает всем арендаторам. Курс хранится
-- СНИМКОМ содержимого (`content` jsonb: карточка + мета программы + модули + материалы),
-- а не ссылкой на курс тенанта-источника. Причины:
--   * снимок не ломается, когда источник правят или архивируют;
--   * копия арендатору получается воспроизводимой — что в каталоге, то и приедет;
--   * «подписка с обновлениями» (ТЗ, позже) добавляется поверх снимка версионированием,
--     а не переделкой модели.
--
-- Право `library.publish` — платформенное (наполнять каталог может только владелец
-- платформы). Читать каталог и копировать курс себе может любой центр правом
-- `courses.write`: копия появляется в его собственных курсах, это его обычная работа.
--
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS core.platform_library_courses (
  id text PRIMARY KEY,
  code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- Снимок: { course, programMeta, modules: [{ title, isRequired, sortOrder, materials: [...] }] }
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Откуда снят снимок — для истории; ссылка НЕ используется при копировании.
  source_tenant_id text NULL REFERENCES core.tenants(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Код курса в каталоге уникален: два «ОТ-2026» в списке неразличимы для методиста.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_library_courses_code
  ON core.platform_library_courses (code);

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_library_publish', 'library.publish', 'Publish and remove courses in the platform library')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code = 'library.publish'
WHERE r.code = 'platform_admin'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
