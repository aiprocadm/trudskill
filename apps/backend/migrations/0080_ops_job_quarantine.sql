-- Фаза 6 Task 7 (ФТ-I1): карантин упавших задач.
--
-- ЗАЧЕМ. Очередь `jobs.dead-letter` в системе есть с Фазы 0 и исправно наполняется:
-- туда попадает всё, что воркер не смог обработать за десять попыток. Читать её было
-- НЕКОМУ — ни консьюмера, ни таблицы, ни экрана. То есть неудавшийся выпуск удостоверения
-- исчезал молча: слушатель ждал документ, которого никто уже не выпустит, и узнавали об
-- этом только по звонку.
--
-- Эта таблица — то место, куда сообщение кладут, чтобы его было ВИДНО и можно было
-- переотправить руками.
--
-- Почему схема `documents`, а не отдельная: карантин наполняется задачами выпуска
-- документов (единственный тип, идущий через воркер), а заводить схему ради одной
-- таблицы — лишняя сущность. Поле `job_type` оставляет место остальным видам работ.
--
-- ВАЖНО про tenant_id: он NULLABLE и БЕЗ внешнего ключа — намеренно. В карантин попадает
-- в том числе мусор: не-JSON, чужой формат, сообщение с несуществующим тенантом. Строгая
-- ссылка означала бы, что именно такое сообщение записать нельзя — и оно снова пропало бы
-- молча, ровно в том случае, когда разбирательство нужнее всего.
--
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS documents.job_quarantine (
  id text PRIMARY KEY,
  -- Может быть NULL: см. пояснение выше.
  tenant_id text NULL,
  -- Идентификатор исходного сообщения; по нему видно повторные попадания.
  message_id text NULL,
  job_type text NULL,
  queue_name text NOT NULL,
  routing_key text NULL,
  -- Тело сообщения КАК ЕСТЬ: его же публикуем обратно при переотправке.
  raw_body text NOT NULL,
  payload jsonb NULL,
  headers jsonb NULL,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text NULL,
  status text NOT NULL DEFAULT 'quarantined'
    CHECK (status IN ('quarantined', 'republished', 'discarded')),
  quarantined_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  resolved_by text NULL,
  -- Сколько раз сообщение переотправляли из карантина. Растущее число — признак того,
  -- что чинят не то: причина не в сообщении.
  republish_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Основной запрос экрана: «что лежит в карантине у этого центра, свежее сверху».
CREATE INDEX IF NOT EXISTS idx_job_quarantine_tenant_status
  ON documents.job_quarantine (tenant_id, status, quarantined_at DESC);

-- Повторное попадание того же сообщения не должно плодить строки: консьюмер
-- обновляет существующую запись (см. ON CONFLICT в воркере).
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_quarantine_message
  ON documents.job_quarantine (message_id)
  WHERE message_id IS NOT NULL;

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_ops_quarantine_read', 'operations.quarantine.read', 'View failed jobs held in quarantine'),
  ('p_ops_quarantine_write', 'operations.quarantine.write', 'Republish or discard quarantined jobs')
ON CONFLICT (id) DO NOTHING;

-- Кому. Разбор застрявших задач — работа администрации: методист не должен решать,
-- переотправлять ли выпуск документа.
INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON p.code IN ('operations.quarantine.read', 'operations.quarantine.write')
WHERE r.code IN ('platform_admin', 'tenant_admin')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
