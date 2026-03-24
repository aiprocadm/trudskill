# MVP domain database model (stage 5)

## Added schemas

- `crm`
- `learning`
- `assessment`
- `documents`
- `storage` (extended metadata model)

## Migration files

- `migrations/0001_backend_foundation.sql` — baseline `core/org/iam/audit/storage` schemas.
- `migrations/0002_mvp_domain_model.sql` — stage-5 transactional domain model for MVP.

## MVP table map

### CRM (`crm`)

- `counterparties`
- `counterparty_contacts`
- `counterparty_employees`

### Learning (`learning`)

- `learners`
- `directions`
- `courses`
- `course_versions`
- `course_settings`
- `course_modules`
- `materials`
- `material_versions`
- `study_groups`
- `group_courses`
- `enrollments`
- `enrollment_status_history`
- `course_progress`
- `module_progress`
- `material_progress`

### Assessment (`assessment`)

- `tests`
- `questions`
- `test_questions`
- `answer_options`
- `test_attempts`
- `attempt_answers`
- `exam_results`

### Documents (`documents`)

- `templates`
- `template_versions`
- `template_variables`
- `template_bindings`
- `generated_documents`
- `numbering_rules`
- `number_reservations`

### Storage (`storage`)

- `files` (metadata-only, extended by stage-5 migration)
- `file_links` (polymorphic links by `entity_type` + `entity_id` + `link_role`)

## Modeling principles

- PostgreSQL is the transaction source of truth for MVP domain data.
- Every domain table includes `tenant_id` with FK to `core.tenants(id)`.
- Consistent naming: plural table names, `id` primary key, `<entity>_id` FK columns.
- Files are metadata-only in DB; binaries stay out of PostgreSQL.

## Key constraints and indexes

- Enrollment uniqueness: `UNIQUE (group_id, learner_id)` in `learning.enrollments`.
- Tenant-aware code uniqueness for business directories (`courses`, `study_groups`, `tests`, `templates`, etc.).
- Numeric checks:
  - `progress_percent BETWEEN 0 AND 100` (`course/module/material_progress`)
  - scores are non-negative (`assessment.*`, `learning.enrollments.final_score`)
  - `attempt_no > 0` (`assessment.test_attempts`)
- Finalization checks for generated documents:
  - finalized document requires `document_date`
  - finalized document requires `finalized_at`
- Reservation consistency:
  - consumed number reservation requires `generated_document_id`
  - reservation expiry cannot be before reservation timestamp
- Storage integrity:
  - unique index `(tenant_id, bucket_name, storage_key)`
  - polymorphic links with uniqueness and primary-link partial index

## Testing coverage (stage 5)

`src/infrastructure/database/mvp-domain-migrations.test.ts` validates:

- migration ordering and presence of stage-5 migration;
- creation of all schemas and declared tables;
- tenant-awareness (`tenant_id`) across every MVP domain table;
- baseline audit fields (`created_at`/`updated_at`) on mutable transactional entities;
- soft-delete fields on selected entities using archival semantics;
- mandatory checks and uniqueness constraints for enrollments/progress/assessment/documents/storage;
- metadata-only storage policy (`bytea` is forbidden).

## Deliberate stage boundaries / technical debt

- No full rollback SQL for stage-5 migration is included yet (current project convention is forward-only idempotent migrations).
- No advanced domain workflows (e-sign, webinars, proctoring) are modeled in this stage.
- Repository/service business logic on top of the new tables is intentionally deferred; stage-5 focuses on persistence schema integrity.
