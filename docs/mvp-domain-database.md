# MVP Domain Database Model (Stage 5+)

## Migration chain

MVP domain persistence is implemented through sequential SQL migrations in `apps/backend/migrations`:

1. `0001_backend_foundation.sql` — foundational schemas (`core`, `org`, `iam`, `audit`, base `storage`) and tenant/IAM primitives.
2. `0002_mvp_domain_model.sql` — first-wave domain schemas and tables for CRM, learning, assessment, documents, storage links.
3. `0003_mvp_domain_integrity_hardening.sql` — tenant-bound foreign keys, status-dependent checks, and additional read indexes.
4. `0004_mvp_esign_domain.sql` — e-sign domain foundation.
5. `0005_documents_domain.sql` — documents pipeline foundation.
6. `0006_documents_task_numbering_hardening.sql` — documents numbering/task invariants.
7. `0007_communication_realtime_foundation.sql` — communication/realtime persistence foundation.
8. `0008_integrations_foundation.sql` — integration providers/credentials/tasks/sync logs.
9. `0009_assessment_extensions.sql` — post-baseline assessment model extensions.
10. `0011_mvp_runtime_json.sql` — runtime JSON persistence table for MVP bounded context.
11. `0012_documents_runtime_json.sql` — runtime JSON persistence table for documents bounded context.

## Domain schemas

The transactional domain is split into tenant-aware schemas:

- `crm`
- `learning`
- `assessment`
- `documents`
- `storage`

Every domain table includes:

- `id` as primary key,
- `tenant_id` as mandatory tenant discriminator,
- timestamp fields (`created_at`, `updated_at`) and soft-delete where relevant,
- explicit FK/UNIQUE/CHECK constraints aligned with MVP invariants.

## Runtime JSON persistence layer

For gradual migration from pure in-memory service state to PostgreSQL-backed runtime state:

- `learning.mvp_runtime_documents` stores per-tenant, per-collection entity JSON for MVP module.
- `documents.runtime_documents` stores per-tenant, per-collection entity JSON for documents module.
- request-scoped interceptors load state at request start and persist at request end.
- tenant serialization gateway prevents lost updates on concurrent requests for the same tenant.

Production requirement:

- `MVP_PERSISTENCE_DRIVER=postgres`
- `DOCUMENTS_PERSISTENCE_DRIVER=postgres`

## Key integrity decisions

### Tenant-aware referential integrity

Cross-table relations are hardened with composite foreign keys `(tenant_id, <entity>_id) -> (<tenant_id>, id)` to prevent accidental cross-tenant linkage.

### Enrollment and progress invariants

- Enrollments keep `UNIQUE (group_id, learner_id)`.
- Progress tables enforce `progress_percent` in `[0, 100]` and non-negative second counters.
- Completed enrollment status requires completion payload fields.

### Assessment invariants

- Attempt numbers are positive.
- Scores are non-negative.
- Attempt status checks enforce presence of `submitted_at`/`completed_at` for terminal states.

### Document finalization and numbering invariants

- Final generated documents require `status='final'`, `document_number`, `document_date`, and `finalized_at`.
- Number reservations in `consumed` state require both `generated_document_id` and `consumed_at`.

### Metadata-only storage model

- Binary payloads are intentionally absent (`no bytea`).
- `storage.files` stores metadata only (`bucket_name`, `storage_key`, checksum, MIME, size, AV status).
- `storage.file_links` provides polymorphic attachment binding via `entity_type`, `entity_id`, and `link_role`.

## Follow-up technical debt (next stage)

- Add migration execution tests against a real PostgreSQL instance in CI (currently schema tests are static SQL assertions).
- Add partial indexes for major report workloads once query profiles are collected from real traffic.
- Introduce explicit enum types where status taxonomies stabilize across modules.
