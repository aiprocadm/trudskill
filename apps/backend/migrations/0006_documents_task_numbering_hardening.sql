-- Stage 9 hardening: task-scoped document type and reservation lifecycle linkage
alter table if exists documents.document_generation_tasks
  add column if not exists document_type text;

update documents.document_generation_tasks
set document_type = coalesce(document_type, 'default')
where document_type is null;

alter table if exists documents.document_generation_tasks
  alter column document_type set not null;

alter table if exists documents.document_generation_tasks
  add column if not exists number_reservation_id text references documents.number_reservations(id);

create index if not exists idx_documents_tasks_tenant_document_type
  on documents.document_generation_tasks(tenant_id, document_type);
