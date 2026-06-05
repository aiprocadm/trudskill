-- 0048_learning_recertification_foundation.sql
-- Phase 5 Plan 5B — recertification foundation.
-- 1) learning.course_versions.recertification_period_months — per-program validity (spec §3.2); NULL = бессрочно.
-- 2) documents.generated_documents.valid_until — stamped at issuance = completed_at + period; NULL = бессрочный документ.
-- 3) learning.recertification_drafts — hybrid-model draft queue (spec §3.4); one active draft per (learner, source document).
-- 4) iam permissions recertification.read / recertification.write + role assignments.

alter table learning.course_versions
  add column if not exists recertification_period_months integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'course_versions_recert_period_chk'
  ) then
    alter table learning.course_versions
      add constraint course_versions_recert_period_chk
      check (recertification_period_months is null or recertification_period_months > 0);
  end if;
end $$;

alter table documents.generated_documents
  add column if not exists valid_until date;

create table if not exists learning.recertification_drafts (
  id text primary key,
  tenant_id text not null,
  learner_id text not null,
  source_document_id text not null,
  course_version_id text not null,
  valid_until date not null,
  status text not null default 'pending',
  resulting_enrollment_id text null,
  reason text null,
  decided_at timestamptz null,
  decided_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_recert_drafts_tenant_learner_source
  on learning.recertification_drafts (tenant_id, learner_id, source_document_id);

create index if not exists idx_recert_drafts_tenant_status
  on learning.recertification_drafts (tenant_id, status);

insert into iam.permissions (id, code, description)
values
  ('p_recertification_read', 'recertification.read', 'Read recertification drafts and queue'),
  ('p_recertification_write', 'recertification.write', 'Trigger scans and approve/reject recertification drafts')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and (
    r.code in ('platform_admin', 'tenant_admin')
    or (r.code = 'methodist' and p.code = 'recertification.read')
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
