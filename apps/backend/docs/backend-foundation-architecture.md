# Backend foundation architecture (Stage 3)

## Context

`apps/backend` is implemented as a **NestJS modular monolith** and serves as the platform foundation for all future domains.

This stage intentionally focuses on shared capabilities:

- tenant-aware execution context;
- IAM/session/RBAC foundation;
- auditability for security-critical actions;
- infrastructure adapters (PostgreSQL, Redis, RabbitMQ, S3-compatible object storage);
- health/readiness probes for orchestration.

## Module boundaries

- `CoreModule` — core providers and cross-cutting runtime utilities.
- `TenantModule` — current tenant resolution, tenant info/settings/requisites endpoints.
- `IamModule` (with `AuthModule`, `UsersModule`, `RolesModule`, `PermissionsModule`, `SessionsModule`) — auth/session lifecycle, role/permission binding, guards/decorators.
- `AuditModule` — centralized audit record creation for auth/security-sensitive actions.
- `FilesModule` — file metadata foundation and storage-client abstraction.
- `HealthModule` — liveness and readiness checks.
- `InfrastructureModule` — database/cache/broker/storage adapters and DI wiring.

## Request lifecycle and cross-cutting concerns

1. Request enters `/api/v1/*`.
2. `RequestContextInterceptor` resolves and propagates `request_id` + `correlation_id`.
3. `TenantGuard` enforces presence of tenant context.
4. Domain controllers/services execute through DTO boundaries and service-layer invariants.
5. `ResponseEnvelopeInterceptor` returns unified `data/meta` envelope.
6. `HttpExceptionEnvelopeFilter` returns unified `error/meta` envelope.

Critical auth/RBAC/session actions emit audit records via `AuditService`.

## Data model scope

Migration `0001_backend_foundation.sql` defines base schemas/tables for:

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

Tenant-aware constraints and indexes are included for login/email uniqueness and common operational filters.

## Extensibility points

The foundation is prepared for future domain modules without breaking boundaries:

- permission guards/decorators are reusable by new modules;
- infrastructure dependencies are hidden behind service interfaces/adapters;
- `FilesModule` supports adding upload intent/presigned URL flows;
- RabbitMQ abstraction provides base for outbox/event processing;
- request context and tenant enforcement can be reused by all bounded contexts.
