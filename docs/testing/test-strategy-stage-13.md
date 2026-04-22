# Stage 13 — Multi-layer Test Strategy

## 1) Target test matrix

| Layer                        | Scope                                                                       | Location                                                  |
| ---------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Backend unit                 | Domain rules, state machines, isolation, idempotency                        | `apps/backend/src/**/*.test.ts`                           |
| Backend integration          | Module-level integration with in-memory adapters and tenant boundaries      | `apps/backend/src/**/*integration.test.ts`                |
| DB/migrations                | Schema consistency and migration snapshots                                  | `apps/backend/src/infrastructure/database/*.test.ts`      |
| Contract                     | DTO/error/meta compatibility and generated OpenAPI checks                   | `packages/api-contracts/src/**/*.test.ts`                 |
| Frontend unit                | Pure UI logic, auth/session helpers, navigation helpers                     | `apps/frontend/src/**/*.test.ts`                          |
| Frontend integration         | Screen/feature tests with API mocks                                         | `apps/frontend/src/**/*.e2e.test.ts`                      |
| Backend e2e (service-level)  | End-to-end business flows across auth/learning/documents/esign              | `apps/backend/src/modules/mvp/business-flows.e2e.test.ts` |
| Security                     | Token misuse, signature verification, cross-tenant attempts                 | `apps/backend/src/modules/**/*security*.test.ts`          |
| Concurrency/idempotency lite | Duplicate submissions, idempotency key reuse, number reservation uniqueness | backend domain tests (documents/esign/integrations/iam)   |

## 2) Current coverage map (normalized)

- **IAM/Auth:** password validation, blocked users, refresh rotation, session revoke, logout-all, token replay protection, auth audit trail.
- **RBAC/Tenant-aware:** permission map tests + backend tenant boundary integration tests.
- **RBAC/Tenant-aware UI:** role-driven navigation visibility, direct-route forbidden redirects, unauthenticated route bootstrap redirects.
- **Learning core:** publish/archive preconditions, enrollment uniqueness, progress aggregation, attempt limits, assignment review workflow.
- **Documents/Numbering:** template activation, variable validation, idempotent generation, number reservation lifecycle, terminal immutability.
- **E-sign/Legal:** application lifecycle, sequential signing order, idempotent signing, legal log events, terminal process snapshots.
- **Integrations/Webhooks/Outbox-like behavior:** callback deduplication, signature verification guardrails, adapter resolution tests.
- **Business e2e flows:** service-level end-to-end coverage for login, course/group/enrollment setup, learner progress+exam, document generation, and full e-sign completion with legal log assertions.
- **Security hardening:** mass-assignment protection on MVP update endpoints (group/course/module/material/direction) with regression tests.

## 3) High-risk non-regression suite

The following scenarios are mandatory before release:

1. Tenant isolation for read/update across IAM, integrations, documents, e-sign, and learning registries.
2. Refresh token replay blocking + session revocation semantics.
3. State-machine terminal-state enforcement (document tasks, generated docs, signing process/participants).
4. Document numbering uniqueness and reservation status integrity.
5. Webhook signature validation and callback idempotency.
6. Legal-log persistence for e-sign lifecycle transitions.

## 4) Determinism and fixture standards

- Use fixed tenant IDs (`tenant_demo`, `t1`) and explicit actor IDs in tests.
- Keep domain tests isolated by creating service instances per test case.
- Prefer deterministic idempotency keys (`*-key-*`) and explicit status assertions.
- Avoid coupling to wall-clock except when checking presence (not exact value) of timestamps.

## 5) CI execution model

- Split CI into layered jobs: `lint_typecheck`, `test_backend`, `test_frontend`, `test_contracts`, `build`.
- Keep fail-fast on lint/typecheck; run test jobs in parallel for faster feedback.
- Preserve unit/integration separation with dedicated scripts (`test:backend`, `test:frontend`, `test:contracts`, `test:security`).

## 6) Commands

```bash
pnpm test:backend
pnpm test:frontend
pnpm test:contracts
pnpm test:security
pnpm test:integration
pnpm test:migrations
```

## 7) Known gaps (intentionally deferred)

1. Full containerized integration with PostgreSQL/Redis/RabbitMQ/object-storage adapters.
2. Browser-level e2e with real UI driver (current suite is Vitest-driven integration tests).
3. Dedicated load/performance stress tests beyond concurrency-lite deterministic checks.
4. DB-level invariants enforced by real DDL constraints for all legal-domain terminal artifacts.

## 8) Stage 13 audit normalization checklist

- Removed overlap between isolated state-machine checks and domain-flow checks by keeping transitions in dedicated `*.state-machine.test.ts` files and domain invariants in service-level suites.
- Added explicit concurrency-lite suite for enrollment and duplicated attempt submission semantics.
- Added UI foundation coverage for permission wrappers, pagination controls, async status widgets, and data-table rendering.
- Standardized deterministic fixture patterns: stable tenant IDs, fixed idempotency keys, and explicit actor/request metadata.
- Hardened migration test harness to resolve monorepo-relative migration paths (`apps/backend/migrations`) so `test:migrations` is deterministic regardless of runner cwd.
- Expanded contract compatibility checks to validate generated OpenAPI artifact availability plus critical endpoint catalogs for assessment/documents/esign/notifications.

## 9) Layered execution in CI (recommended jobs)

1. `test:backend` — domain unit + module integration.
2. `test:migrations` — migration chain and DB invariant assertions.
3. `test:contracts` — OpenAPI/DTO compatibility.
4. `test:frontend` — frontend unit/integration.
5. `test:security` — focused high-risk security suite.
6. `test:integration` — backend integration smoke layer.

Heavy e2e/browser and containerized infra jobs remain optional follow-up jobs until dedicated runtime agents are enabled.

## 10) Stage 13 delta (2026-03-30)

- IAM coverage expanded for explicit **expired refresh-session rejection** with forced revocation semantics.
- IAM coverage expanded for **logout current session** behavior to ensure only targeted session is revoked.
- Integration-level auth coverage now validates replay/misuse branch for expired tokens in addition to cross-tenant invalidation.

## 11) Added regression focus set (2026-04-22)

The following scenarios are now explicitly required in the regression baseline and mapped to existing suites:

1. **Unit**
   - Domain rules (state transitions and guardrails).
   - Grade/completion invariants for learner attempts/progress.
   - Idempotency helpers (same key => same outcome, concurrency-safe).
   - Token/session helpers (refresh rotation, replay block, session revoke semantics).
2. **Integration**
   - Repository + migration compatibility checks.
   - Dual-write/backfill/reconciliation controls.
   - Outbox-like publish/consume behavior with ack/nack-safe retries.
3. **E2E**
   - `login -> refresh -> me -> logout`.
   - Course lifecycle through completion artifact issuance.
   - Teacher review flow.
   - Failed integration replay path.
4. **Production-profile**
   - Startup checks in production env.
   - Dependency outages (DB/Rabbit/S3 unavailable).
   - Replayed webhook deduplication.
   - Worker restart/replay during in-flight job processing.
5. **Risk policy**
   - Any risky behavior change must include a mandatory regression test in one of the layers above.
