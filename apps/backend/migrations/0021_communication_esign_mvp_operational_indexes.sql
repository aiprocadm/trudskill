-- communication
create index if not exists idx_chat_dialogs_tenant_updated
  on communication.chat_dialogs (tenant_id, updated_at desc);

create index if not exists idx_webinars_tenant_status_updated
  on communication.webinars (tenant_id, status, updated_at desc);

-- esign
create index if not exists idx_esign_applications_tenant_status_updated
  on esign.esign_applications (tenant_id, status, updated_at desc);

create index if not exists idx_esign_application_files_tenant_status_updated
  on esign.esign_application_files (tenant_id, status, updated_at desc);

create index if not exists idx_signing_processes_tenant_status_updated
  on esign.signing_processes (tenant_id, status, updated_at desc);

create index if not exists idx_signing_participants_tenant_status_updated
  on esign.signing_participants (tenant_id, status, updated_at desc);

-- mvp runtime (legacy + normalized)
create index if not exists idx_mvp_runtime_documents_tenant_updated
  on learning.mvp_runtime_documents (tenant_id, updated_at desc);

create index if not exists idx_mvp_runtime_documents_tenant_collection_updated
  on learning.mvp_runtime_documents (tenant_id, collection, updated_at desc);

create index if not exists idx_mvp_stage1_runtime_documents_tenant_updated
  on learning.mvp_stage1_runtime_documents (tenant_id, updated_at desc);

create index if not exists idx_mvp_stage1_runtime_documents_tenant_collection_updated
  on learning.mvp_stage1_runtime_documents (tenant_id, collection, updated_at desc);
