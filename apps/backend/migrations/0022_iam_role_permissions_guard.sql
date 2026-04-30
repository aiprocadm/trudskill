-- Восстанавливает отсутствующую таблицу rbac (см. 0010). Только DDL: seed вынесен в 0024,
-- иначе при ошибке INSERT в одной транзакции откатывается и CREATE.

CREATE TABLE IF NOT EXISTS iam.role_permissions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  role_id text NOT NULL REFERENCES iam.roles(id),
  permission_id text NOT NULL REFERENCES iam.permissions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role_id, permission_id)
);
