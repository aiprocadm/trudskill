# Backend foundation (Stage 3)

## Modules

- `core`: shared logging and core providers.
- `tenant`: tenant context + tenant info/settings/requisites endpoints.
- `iam`: login/logout/refresh/me, sessions, roles, permissions, user-role assignment. Includes module split (`AuthModule`, `UsersModule`, `RolesModule`, `PermissionsModule`, `SessionsModule`) for bounded-context growth.
- `audit`: central audit service for security-sensitive actions.
- `files`: metadata foundation and storage abstraction readiness.
- `health`: liveness and readiness endpoints.

See architecture note: [`docs/backend-foundation-architecture.md`](./docs/backend-foundation-architecture.md).

## Endpoint map

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/:id`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/roles`
- `GET /api/v1/permissions`
- `GET /api/v1/users/:id/roles`
- `PUT /api/v1/users/:id/roles`
- `GET /api/v1/tenant/me`
- `GET /api/v1/tenant/settings`
- `GET /api/v1/tenant/requisites`
- `GET /api/v1/workspace/summary`
- `GET /api/v1/tasks/inbox`
- `GET /api/v1/blockers`
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

## Database tables

Migration `migrations/0001_backend_foundation.sql` creates:

- `core.tenants`
- `org.tenant_requisites`
- `org.tenant_settings`
- `iam.users`
- `iam.roles`
- `iam.permissions`
- `iam.user_roles`
- `iam.sessions`
- `iam.auth_events`
- `audit.audit_log`
- `storage.files`

## Seed data

`src/seeds/dev-seed.ts` contains deterministic dev/test fixtures:

- demo tenant + requisites/settings;
- baseline permissions;
- roles (`platform_admin`, `tenant_admin`, `manager`, `methodist`);
- active + blocked users.

## Local commands

- `pnpm --filter @trudskill/backend dev`
- `pnpm --filter @trudskill/backend test`

## Notes

Current implementation provides deterministic in-memory foundation services plus SQL migration/seeds for further wiring with PostgreSQL/Redis/RabbitMQ/S3 adapters.
