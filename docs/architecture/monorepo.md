# Monorepo architecture

This repository uses a TypeScript-first monorepo with Turborepo orchestration.

- `apps/` contains executable runtimes (frontend, backend, worker, realtime).
- `packages/` contains shared contracts, types, UI and testing utilities.
- `infra/` contains runtime-independent local infrastructure orchestration.
- Shared TypeScript paths in `tsconfig.base.json` enforce single contracts source.
