-- Stage-1 JSONB usage contract for normalized enterprise tables.
-- JSONB is reserved for:
--   1) extension payload,
--   2) integration settings,
--   3) audit snapshots / raw provider payload.
-- Domain key attributes (status/type/date/foreign keys) must remain typed columns.

-- core
comment on column core.users.payload is
  'Extension payload only. Do not store domain key attributes (status/type/date/foreign keys).';
comment on column core.roles.payload is
  'Extension payload only. Do not store domain key attributes (status/type/date/foreign keys).';
comment on column core.permissions.payload is
  'Extension payload only. Do not store domain key attributes (status/type/date/foreign keys).';
comment on column core.sessions.payload is
  'Audit snapshot payload for session context (e.g., claim snapshot/device fingerprint details); key lifecycle fields stay typed.';

-- learning
comment on column learning.courses.payload is
  'Extension payload only. Do not duplicate typed course status/lifecycle/date attributes.';
comment on column learning.course_versions.payload is
  'Extension payload only. Version status/date/version number fields stay typed.';
comment on column learning.course_modules.payload is
  'Extension payload only. Module identity/order relationships stay typed.';
comment on column learning.materials.payload is
  'Extension payload only. Material type and parent foreign keys stay typed.';
comment on column learning.groups.payload is
  'Extension payload only. Group status and schedule fields stay typed.';
comment on column learning.enrollments.payload is
  'Extension payload only. Enrollment status/date/foreign keys stay typed.';
comment on column learning.progress.payload is
  'Extension payload only. Progress status/percent and foreign keys stay typed.';

-- assessment
comment on column assessment.tests.payload is
  'Extension payload only. Assessment status and lifecycle dates stay typed.';
comment on column assessment.questions.payload is
  'Extension payload only. Question type and parent references stay typed.';
comment on column assessment.attempts.payload is
  'Extension payload only. Attempt status/timestamps and foreign keys stay typed.';
comment on column assessment.answers.answer_jsonb is
  'Extension payload for answer body/details only; scoring and relational keys stay typed.';
comment on column assessment.results.payload is
  'Extension payload only. Result totals/pass flags and references stay typed.';
comment on column assessment.assignments.payload is
  'Extension payload only. Assignment due dates and typed attributes stay in columns.';
comment on column assessment.submissions.content_jsonb is
  'Primary submission content payload (domain content), while status/date/foreign keys remain typed columns.';

-- documents
comment on column documents.templates.payload is
  'Extension payload only. Template status/code/version linkage stays typed.';
comment on column documents.template_versions.payload is
  'Extension payload only. Version status/number and parent references stay typed.';
comment on column documents.generated_documents.payload is
  'Extension payload only. Document status/number and template references stay typed.';
comment on column documents.document_tasks.payload is
  'Extension payload only. Task type/status and references stay typed.';
comment on column documents.numbering_rules.payload is
  'Extension payload only. Rule activation/type/pattern fields stay typed.';

-- integrations
comment on column integrations.providers.payload is
  'Extension payload only. Provider identity/type/activation stays typed.';
comment on column integrations.credentials.settings_jsonb is
  'Integration settings payload only (provider configuration). Credentials status/references stay typed.';
comment on column integrations.credentials.payload is
  'Extension payload only. Credential status/identity and provider foreign keys stay typed.';
comment on column integrations.sync_jobs.payload is
  'Audit snapshot / raw integration execution context; job status/type/timestamps/references stay typed.';
comment on column integrations.sync_logs.request_payload_jsonb is
  'Raw provider request payload snapshot for audit/diagnostics.';
comment on column integrations.sync_logs.response_payload_jsonb is
  'Raw provider response payload snapshot for audit/diagnostics.';
comment on column integrations.idempotency_keys.response_jsonb is
  'Audit snapshot of idempotent response payload; key scope/hash metadata stay typed.';
comment on column integrations.webhook_events.payload is
  'Raw inbound provider payload snapshot for audit/replay. Event status/type/references stay typed.';
comment on column integrations.dead_letters.payload is
  'Audit snapshot of failed message payload for retry/forensics; state fields stay typed.';

-- comm
comment on column comm.notifications.metadata_jsonb is
  'Extension payload only for non-key delivery metadata. Notification status/relations/dates stay typed.';
comment on column comm.notifications.payload_jsonb is
  'Audit snapshot / raw provider payload for notification transport events.';
comment on column comm.dialogs.payload is
  'Extension payload only. Dialog type/assignment/references stay typed.';
comment on column comm.messages.payload is
  'Extension payload only. Message type/sender/dialog/date fields stay typed.';
comment on column comm.webinars.payload is
  'Extension payload only. Webinar status/schedule/provider linkage stays typed.';
comment on column comm.webinar_attendees.payload is
  'Extension payload only. Attendance status/role/timing and foreign keys stay typed.';
