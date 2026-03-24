# Contributing guide

## Branches and commits

- Work in feature branches from `main`.
- Use Conventional Commits:
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `chore(scope): ...`
- `commit-msg` hook enforces commit format.

## Hooks and local checks

- `pre-commit` runs `lint-staged` (eslint + prettier on staged files).
- `pre-push` runs `pnpm typecheck`.
- Install hooks automatically with `pnpm install` (`prepare` script).

## Dependency policy

- Add shared dependencies in repo root when used by multiple apps/packages.
- Add app-specific dependencies in the corresponding `apps/*/package.json`.
- Add package-specific dependencies in the corresponding `packages/*/package.json`.
- Prefer `workspace:*` for internal package links.

## Shared package rules

- Runtime-agnostic shared types belong to `packages/shared-types`.
- API DTO/contracts/schemas belong to `packages/api-contracts`.
- Shared UI primitives belong to `packages/ui`.
- Shared testing helpers belong to `packages/test-utils`.

## TypeScript, ESLint, Prettier standards

- Keep TypeScript strict mode enabled.
- Reuse root/tooling configs, avoid local config duplication.
- Use `type` imports where applicable.
- Keep imports ordered and remove unused variables/imports.
- Format code with Prettier before opening PR.

## Config duplication policy

Forbidden without explicit need and review:

- duplicate tsconfig hierarchies;
- duplicate eslint/prettier foundations;
- local env keys not reflected in `.env.example`;
- ad-hoc docker/CI configs conflicting with root standards.

## Required checks before PR

Run from repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
