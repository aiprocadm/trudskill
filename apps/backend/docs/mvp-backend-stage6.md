# Stage 6 Backend MVP domains

Implemented backend endpoint groups under `/api/v1`:

- `/counterparties`
- `/learners`
- `/directions`
- `/courses` (+ `/courses/:id/publish`, `/courses/:id/archive`)
- `/course-versions`
- `/modules`
- `/materials`
- `/groups`
- `/group-courses`
- `/enrollments` (+ `/enrollments/:id/status`, `/enrollments/:id/status-history`)
- `/progress` (+ `/progress/materials/:materialId`)

Domain decisions:

- Course lifecycle uses `draft -> published -> archived`; publish requires at least one course version.
- Enrollment lifecycle is validated via state machine transitions (`pending`, `active`, `suspended`, `completed`, `cancelled`) and each transition is written to `enrollment_status_history`.
- Material/module/course progress is calculated only on backend, with bounded `progress_percent` and explicit `calculatedAt` updates.
- `min_view_seconds` and progress seconds are treated as non-negative values and validated in service/domain logic.
- Material may reference storage metadata by `fileId`; no file blob storage in learning entities.

Notes:

- Implementation stays tenant-aware through `TenantScopedRepository.enforceTenantScope` and tenant-based list filtering.
- Critical create/update/publish/archive/status actions are audit-logged.
