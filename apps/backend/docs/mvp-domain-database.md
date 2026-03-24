# MVP domain database model (stage 5)

## Added schemas

- `crm`
- `learning`
- `assessment`
- `documents`
- `storage` (extended)

## Modeling principles

- PostgreSQL is the transaction source of truth for MVP domain data.
- Every domain table includes `tenant_id` and links to `core.tenants(id)`.
- Consistent naming: plural table names, `id` PK, `<entity>_id` FK columns.
- Files are metadata-only in DB (`storage.files` + polymorphic `storage.file_links`).

## Main entities

- CRM: counterparties, contacts, counterparty employees.
- Learning: learners, directions, courses, course versions/settings, modules/materials/versions, study groups, enrollments, progress aggregates.
- Assessment: tests, questions, options, attempts, answers, exam results.
- Documents: templates and versions, variable registry, bindings, generated documents, numbering rules/reservations.
- Storage: enriched file metadata and entity links.

## Key integrity rules

- Enrollment uniqueness: `UNIQUE (group_id, learner_id)`.
- Tenant-aware uniqueness for domain codes (courses, groups, templates, tests, etc.).
- Numeric checks: progress range `0..100`, scores `>= 0`, `attempt_no > 0`.
- Final document rule: finalized document requires `document_date` and `finalized_at`.
- Number reservation consistency: `consumed` reservation requires `generated_document_id`.

## Migration strategy

- `0001_backend_foundation.sql`: existing core/iam/audit foundation.
- `0002_mvp_domain_model.sql`: stage-5 MVP domain schemas, tables, constraints, indexes.

Stage-5 migration is idempotent (`IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) and designed to evolve existing foundation tables without breaking stage-1 assets.
