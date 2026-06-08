# Phase 0 — Pilot Launch Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the deployment artifacts (Docker images, prod compose, reverse-proxy, CD, backups, runbooks) that let the already-built CDOProf platform run on a single server behind the owner's domain with HTTPS.

**Architecture:** Single server, Docker Compose. Caddy terminates TLS (auto Let's Encrypt) and reverse-proxies one domain → frontend (`/`), backend (`/api/v1/*`), realtime (`/ws`). Infra services (postgres/redis/rabbitmq/minio/supertokens) run only on the internal docker network. CD builds images **on the server** (`git reset --hard origin/main` → `docker compose up -d --build`), no registry. Spec: [docs/superpowers/specs/2026-06-08-phase-0-pilot-launch-foundation-design.md](../specs/2026-06-08-phase-0-pilot-launch-foundation-design.md).

**Tech Stack:** Docker / Docker Compose, Caddy 2, Next.js 15 standalone output, NestJS, GitHub Actions (`workflow_run` + SSH), Bash, Zod (env validator).

---

> **Verification model (read first).** This is infrastructure/ops work. Where real automated logic exists (the env validator), we test it by running it. For declarative artifacts (Dockerfile, compose, Caddyfile, workflow, shell) the "test" is the **build / config / validate / lint** command, run _before_ a change to see the gap and _after_ to confirm. The live `up` + healthcheck + magic-link smoke happens at **deploy time on the server**, not locally (owner provides server/DNS/SMTP later — see spec §9). Docker **is** available locally (v29.x), so build/config/validate steps are real.
>
> **Commit footer.** Per [CLAUDE.md](../../../CLAUDE.md), end every commit message with the line `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. The commit commands below omit it for brevity — add it.
>
> **Branch.** Work on `feat/2026-06-08-phase-0-pilot-launch-foundation` (already created off `main`; the spec is committed there as `8244f16`).
>
> **Bash tool.** Run verification commands with the Bash tool (POSIX). PowerShell inline `VAR=val cmd` does not work; the Bash forms below do.

---

## File Structure

| File                                     | Responsibility                                                                    | Task |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ---- |
| `apps/frontend/next.config.ts` (modify)  | enable `output: 'standalone'` + monorepo tracing root                             | 1    |
| `apps/frontend/Dockerfile` (create)      | production Next.js image (standalone), bakes `NEXT_PUBLIC_*`                      | 1    |
| `infra/.env.production.example` (create) | prod env template: service-name hosts, real-domain placeholders, secret-gen notes | 2    |
| `.gitignore` (modify)                    | ignore the real `infra/.env.production`                                           | 2    |
| `scripts/check-env.ts` (modify)          | reject dev-default secrets when `NODE_ENV=production`                             | 3    |
| `infra/docker-compose.prod.yml` (create) | prod stack: all app images + frontend + Caddy, infra ports closed                 | 4    |
| `infra/Caddyfile` (create)               | domain routing + auto-HTTPS                                                       | 5    |
| `.github/workflows/deploy.yml` (create)  | CD: after green CI → SSH → build-on-server                                        | 6    |
| `infra/backup.sh` (create)               | nightly pg_dump + MinIO volume snapshot + retention; restore notes                | 7    |
| `infra/server-setup.md` (create)         | one-time server bootstrap runbook                                                 | 8    |
| `infra/bootstrap-admin.md` (create)      | create first tenant + admin in prod                                               | 8    |

**Task order:** code/config artifacts first (1–7), operational docs last (8), per the owner's "code first" directive (spec §9).

---

### Task 1: Frontend production image

**Files:**

- Modify: `apps/frontend/next.config.ts`
- Create: `apps/frontend/Dockerfile`
- Verify: `docker build` of the frontend image

- [ ] **Step 1: Enable standalone output + tracing root**

Replace the whole of `apps/frontend/next.config.ts` with:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace workspace deps from the repo root so the standalone bundle is complete.
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@cdoprof/ui']
};

export default nextConfig;
```

- [ ] **Step 2: Confirm local typecheck still passes**

Run: `pnpm --filter @cdoprof/frontend exec tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Create the frontend Dockerfile**

Create `apps/frontend/Dockerfile` (mirrors `apps/backend/Dockerfile`, adds Next standalone runtime + build-arg bake):

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY tooling tooling
RUN pnpm install --filter @cdoprof/frontend... --frozen-lockfile

FROM deps AS build
# NEXT_PUBLIC_* are inlined at build time — they MUST be present now, not at runtime.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @cdoprof/shared-types build \
 && pnpm --filter @cdoprof/api-contracts build \
 && pnpm --filter @cdoprof/ui build \
 && pnpm --filter @cdoprof/frontend build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# Next.js standalone output (monorepo layout: server.js lives under apps/frontend/).
COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /app/apps/frontend/public ./apps/frontend/public
USER app
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
```

- [ ] **Step 4: Build the image to verify (the real test)**

Run (from repo root):

```bash
docker build -f apps/frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://example.test/api/v1 \
  --build-arg NEXT_PUBLIC_REALTIME_URL=wss://example.test/ws \
  -t cdoprof-frontend:verify .
```

Expected: build completes; final line `naming to docker.io/library/cdoprof-frontend:verify`.

> If the build fails at runtime-stage COPY because `server.js` is not at `apps/frontend/server.js`, inspect the standalone layout: `docker build --target build -t t . && docker run --rm t find apps/frontend/.next/standalone -name server.js`. Adjust the COPY/CMD path to match (this is the one expected iteration point for monorepo standalone).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/next.config.ts apps/frontend/Dockerfile
git commit -m "feat(frontend): production standalone Docker image"
```

---

### Task 2: Production environment template

**Files:**

- Create: `infra/.env.production.example`
- Modify: `.gitignore`
- Verify: prettier-clean + gitignore covers the real file

- [ ] **Step 1: Create `infra/.env.production.example`**

```bash
# ────────────────────────────────────────────────────────────────────────────
# CDOProf — PRODUCTION environment (Approach A: single server + Docker Compose).
# Copy to infra/.env.production on the server and fill EVERY value marked CHANGE_ME.
# infra/.env.production is gitignored — NEVER commit real secrets.
# Generate each secret with:  openssl rand -hex 32
# Hosts below are docker-network service names (NOT localhost) — keep them as-is.
# ────────────────────────────────────────────────────────────────────────────

NODE_ENV=production
RELEASE_VERSION=prod

# --- App connection URLs (internal docker DNS = service names) ---
DATABASE_URL=postgresql://cdoprof:CHANGE_ME_DB_PASSWORD@postgres:5432/cdoprof
REDIS_URL=redis://redis:6379
RABBITMQ_URL=amqp://cdoprof:CHANGE_ME_RABBIT_PASSWORD@rabbitmq:5672
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=CHANGE_ME_MINIO_USER
S3_SECRET_KEY=CHANGE_ME_MINIO_PASSWORD
S3_BUCKET=cdoprof

# --- Container credentials (image-specific var names; MUST match the URLs above) ---
POSTGRES_DB=cdoprof
POSTGRES_USER=cdoprof
POSTGRES_PASSWORD=CHANGE_ME_DB_PASSWORD
RABBITMQ_DEFAULT_USER=cdoprof
RABBITMQ_DEFAULT_PASS=CHANGE_ME_RABBIT_PASSWORD
MINIO_ROOT_USER=CHANGE_ME_MINIO_USER
MINIO_ROOT_PASSWORD=CHANGE_ME_MINIO_PASSWORD

# --- Secrets (openssl rand -hex 32) ---
AUTH_JWT_SECRET=CHANGE_ME_GENERATE_HEX
SESSION_SECRET=CHANGE_ME_GENERATE_HEX
REALTIME_PUBLISH_KEY=CHANGE_ME_GENERATE_HEX
INTEGRATION_WEBHOOK_SECRET=CHANGE_ME_GENERATE_HEX

# --- SuperTokens (backend side) ---
AUTH_PROVIDER=legacy
SUPERTOKENS_CORE_URI=http://supertokens:3567
SUPERTOKENS_API_KEY=CHANGE_ME_GENERATE_HEX
SUPERTOKENS_APP_NAME=cdoprof
SUPERTOKENS_API_DOMAIN=https://YOUR_DOMAIN
SUPERTOKENS_WEBSITE_DOMAIN=https://YOUR_DOMAIN

# --- SuperTokens (container side; image reads these EXACT names) ---
POSTGRESQL_CONNECTION_URI=postgresql://cdoprof:CHANGE_ME_DB_PASSWORD@postgres:5432/cdoprof
API_KEYS=CHANGE_ME_GENERATE_HEX
# NB: API_KEYS must equal SUPERTOKENS_API_KEY above.

# --- Public URLs (your real domain) ---
PUBLIC_DOMAIN=YOUR_DOMAIN
PUBLIC_BASE_URL=https://YOUR_DOMAIN
CORS_ORIGIN=https://YOUR_DOMAIN
BACKEND_PUBLIC_URL=https://YOUR_DOMAIN
REALTIME_PUBLIC_URL=https://YOUR_DOMAIN
WORKER_INTERNAL_URL=http://worker:3010

# --- Frontend build-time bake (must match Caddy routing) ---
NEXT_PUBLIC_API_BASE_URL=https://YOUR_DOMAIN/api/v1
NEXT_PUBLIC_REALTIME_URL=wss://YOUR_DOMAIN/ws

# --- Ports (internal only; not published except via Caddy) ---
FRONTEND_PORT=3000
BACKEND_PORT=3001
REALTIME_PORT=3002

# --- Workers / documents / realtime tuning ---
WORKER_CONCURRENCY=5
DOCUMENT_GENERATION_QUEUE=documents.generation
DOCUMENTS_STORAGE_BUCKET=cdoprof
REALTIME_STREAM_MAXLEN=5000
REALTIME_STREAM_TTL_SECONDS=86400
REALTIME_STREAM_READ_BATCH=200
REALTIME_DIAGNOSTICS_MAX_ITEMS=1000
REALTIME_DIAGNOSTICS_TTL_SECONDS=604800

# --- DB migrations (auto-run on backend boot) ---
DB_MIGRATIONS_ENABLED=true
DB_MIGRATIONS_DIR=migrations

# --- Antivirus: stays OFF for pilot (spec §11) ---
ANTIVIRUS_ENABLED=false
CLAMAV_HOST=clamav
CLAMAV_PORT=3310

# --- Email: REQUIRED for magic-link login + Phase 5 notifications ---
NOTIFICATIONS_EMAIL_ENABLED=true
SMTP_HOST=CHANGE_ME_SMTP_HOST
SMTP_PORT=587
SMTP_USER=CHANGE_ME_SMTP_USER
SMTP_PASSWORD=CHANGE_ME_SMTP_PASSWORD
SMTP_FROM=no-reply@YOUR_DOMAIN

# --- Caddy ACME (optional: email for cert expiry notices) ---
ACME_EMAIL=
```

- [ ] **Step 2: Ignore the real prod env file**

Run:

```bash
grep -qxF 'infra/.env.production' .gitignore || printf '\n# Production secrets (server-only, never commit)\ninfra/.env.production\n' >> .gitignore
```

- [ ] **Step 3: Verify gitignore works**

Run:

```bash
cp infra/.env.production.example infra/.env.production
git check-ignore infra/.env.production && echo IGNORED_OK
```

Expected: prints `infra/.env.production` then `IGNORED_OK`. (Leave the local `infra/.env.production` — Task 4 reuses it for validation.)

- [ ] **Step 4: Commit**

```bash
git add infra/.env.production.example .gitignore
git commit -m "feat(infra): production env template + gitignore real secrets"
```

---

### Task 3: Reject dev-default secrets in production (env validator)

**Files:**

- Modify: `scripts/check-env.ts`
- Verify: run `pnpm env:check` with crafted prod env (bash)

- [ ] **Step 1: Confirm the gap (current behavior accepts a dev default)**

Run (one line, bash):

```bash
NODE_ENV=production DATABASE_URL=postgresql://u:p@postgres:5432/d REDIS_URL=redis://redis:6379 RABBITMQ_URL=amqp://u:p@rabbitmq:5672 S3_ENDPOINT=http://minio:9000 S3_ACCESS_KEY=k S3_SECRET_KEY=s S3_BUCKET=b AUTH_JWT_SECRET=change-me-in-production SESSION_SECRET=change-me-in-production CORS_ORIGIN=https://x.test PUBLIC_BASE_URL=https://x.test BACKEND_PUBLIC_URL=https://x.test REALTIME_PUBLIC_URL=https://x.test WORKER_INTERNAL_URL=http://worker:3010 NEXT_PUBLIC_API_BASE_URL=https://x.test/api/v1 NEXT_PUBLIC_REALTIME_URL=wss://x.test/ws REALTIME_PUBLISH_KEY=0123456789 INTEGRATION_WEBHOOK_SECRET=0123456789 pnpm -s env:check; echo "exit=$?"
```

Expected NOW (the bug): `✅ Environment variables are valid` / `exit=0` — a `change-me` secret is accepted in production.

- [ ] **Step 2: Add the production dev-default guard**

In `scripts/check-env.ts`, replace the `.superRefine(...)` block (currently only the `INTEGRATION_WEBHOOK_SECRET` check) with:

```ts
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (!env.INTEGRATION_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'INTEGRATION_WEBHOOK_SECRET is required in production',
        path: ['INTEGRATION_WEBHOOK_SECRET']
      });
    }

    // Reject obvious dev/placeholder values that pass length checks but are insecure.
    const DEV_DEFAULT_MARKERS = [
      'change-me',
      'dev-webhook-secret',
      'minio123',
      'postgres:postgres',
      'guest:guest',
      'supertokens-api-key'
    ];
    const SECRET_FIELDS = [
      'AUTH_JWT_SECRET',
      'SESSION_SECRET',
      'REALTIME_PUBLISH_KEY',
      'INTEGRATION_WEBHOOK_SECRET',
      'DATABASE_URL',
      'RABBITMQ_URL',
      'S3_SECRET_KEY'
    ] as const;

    for (const field of SECRET_FIELDS) {
      const value = String((env as Record<string, unknown>)[field] ?? '').toLowerCase();
      if (value && DEV_DEFAULT_MARKERS.some((marker) => value.includes(marker))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} looks like a dev default — set a real secret in production`,
          path: [field]
        });
      }
    }
  });
```

- [ ] **Step 3: Verify it now rejects the dev default**

Run the exact command from Step 1 again.
Expected AFTER: `❌ Invalid environment configuration` listing `AUTH_JWT_SECRET` / `SESSION_SECRET` / `exit=1`.

- [ ] **Step 4: Verify a clean prod env still passes**

Run (same as Step 1 but with real-looking secrets):

```bash
NODE_ENV=production DATABASE_URL=postgresql://cdoprof:s3cret@postgres:5432/cdoprof REDIS_URL=redis://redis:6379 RABBITMQ_URL=amqp://cdoprof:r4bbit@rabbitmq:5672 S3_ENDPOINT=http://minio:9000 S3_ACCESS_KEY=k S3_SECRET_KEY=8f2b1d S3_BUCKET=cdoprof AUTH_JWT_SECRET=$(openssl rand -hex 32) SESSION_SECRET=$(openssl rand -hex 32) CORS_ORIGIN=https://x.test PUBLIC_BASE_URL=https://x.test BACKEND_PUBLIC_URL=https://x.test REALTIME_PUBLIC_URL=https://x.test WORKER_INTERNAL_URL=http://worker:3010 NEXT_PUBLIC_API_BASE_URL=https://x.test/api/v1 NEXT_PUBLIC_REALTIME_URL=wss://x.test/ws REALTIME_PUBLISH_KEY=$(openssl rand -hex 16) INTEGRATION_WEBHOOK_SECRET=$(openssl rand -hex 16) pnpm -s env:check; echo "exit=$?"
```

Expected: `✅ Environment variables are valid` / `exit=0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-env.ts
git commit -m "feat(tooling): reject dev-default secrets in production env check"
```

---

### Task 4: Production docker-compose

**Files:**

- Create: `infra/docker-compose.prod.yml`
- Verify: `docker compose config -q` (needs `infra/.env.production` from Task 2 Step 3)

- [ ] **Step 1: Create `infra/docker-compose.prod.yml`**

```yaml
name: cdoprof

services:
  postgres:
    image: postgres:16
    env_file: .env.production
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    volumes:
      - redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.13-management
    env_file: .env.production
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'rabbitmq-diagnostics', '-q', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ':9001'
    env_file: .env.production
    volumes:
      - minio-data:/data
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 10s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    env_file: .env.production
    restart: 'no'
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $${MINIO_ROOT_USER} $${MINIO_ROOT_PASSWORD} &&
      mc mb --ignore-existing local/$${S3_BUCKET}
      "

  supertokens:
    image: registry.supertokens.io/supertokens/supertokens-postgresql:9.3
    env_file: .env.production
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3567/hello']
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ..
      dockerfile: apps/backend/Dockerfile
    env_file: .env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      minio:
        condition: service_healthy
      supertokens:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3001/api/v1/health/live']
      interval: 10s
      timeout: 5s
      retries: 5

  realtime:
    build:
      context: ..
      dockerfile: apps/realtime/Dockerfile
    env_file: .env.production
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  worker:
    build:
      context: ..
      dockerfile: apps/worker/Dockerfile
    env_file: .env.production
    depends_on:
      rabbitmq:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: ..
      dockerfile: apps/frontend/Dockerfile
      args:
        NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL}
        NEXT_PUBLIC_REALTIME_URL: ${NEXT_PUBLIC_REALTIME_URL}
    env_file: .env.production
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

  caddy:
    image: caddy:2
    depends_on:
      - frontend
      - backend
      - realtime
    env_file: .env.production
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    restart: unless-stopped

volumes:
  postgres-data:
  redis-data:
  rabbitmq-data:
  minio-data:
  caddy-data:
  caddy-config:
```

> **Why `env_file` on every service (no `${...}` interpolation):** each image gets exactly the vars it needs from one file — postgres reads `POSTGRES_*`, minio `MINIO_ROOT_*`, rabbitmq `RABBITMQ_DEFAULT_*`, supertokens `POSTGRESQL_CONNECTION_URI`/`API_KEYS`. The only interpolated values are the frontend **build args** (`NEXT_PUBLIC_*`), which is why deploy/validation **source** `.env.production` before running compose (see Step 2 and Task 6).
>
> `$${VAR}` in healthcheck/entrypoint escapes to a literal `$VAR` evaluated by the container's shell (which has the var from `env_file`).

- [ ] **Step 2: Validate the compose file (the real test)**

Run (from repo root; reuses `infra/.env.production` created in Task 2 Step 3):

```bash
set -a; . infra/.env.production; set +a
docker compose -f infra/docker-compose.prod.yml config -q && echo CONFIG_OK
```

Expected: `CONFIG_OK` with no warnings about undefined variables or invalid keys.

- [ ] **Step 3: Commit**

```bash
git add infra/docker-compose.prod.yml
git commit -m "feat(infra): production docker-compose (frontend + caddy, closed ports)"
```

---

### Task 5: Reverse proxy (Caddy)

**Files:**

- Create: `infra/Caddyfile`
- Verify: `caddy validate` via the caddy docker image

- [ ] **Step 1: Create `infra/Caddyfile`**

```caddyfile
{
	email {$ACME_EMAIL}
}

{$PUBLIC_DOMAIN} {
	encode zstd gzip

	@api path /api/v1/*
	handle @api {
		reverse_proxy backend:3001
	}

	@ws path /ws*
	handle @ws {
		reverse_proxy realtime:3002
	}

	handle {
		reverse_proxy frontend:3000
	}
}
```

> Caddy obtains/renews the Let's Encrypt cert for `{$PUBLIC_DOMAIN}` automatically once the domain's DNS A-record points at the server (owner action, spec §9). WebSocket upgrades on `/ws` are proxied transparently. An empty `ACME_EMAIL` is valid (Caddy just skips expiry-notice email).

- [ ] **Step 2: Validate the Caddyfile (the real test)**

Run:

```bash
docker run --rm -e PUBLIC_DOMAIN=example.test -e ACME_EMAIL= \
  -v "$PWD/infra/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2 caddy validate --config /etc/caddy/Caddyfile && echo CADDY_OK
```

Expected: `Valid configuration` … `CADDY_OK`.

- [ ] **Step 3: Commit**

```bash
git add infra/Caddyfile
git commit -m "feat(infra): Caddy reverse-proxy with auto-HTTPS"
```

---

### Task 6: CD workflow (build on server)

**Files:**

- Create: `.github/workflows/deploy.yml`
- Verify: `actionlint` via docker

- [ ] **Step 1: Confirm the CI workflow name (to chain on it)**

Run:

```bash
grep -m1 '^name:' .github/workflows/ci.yml
```

Use the printed value in `workflows: [...]` below (this plan assumes `CI`; if it differs, substitute it).

- [ ] **Step 2: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  workflow_run:
    workflows: ['CI']
    types: [completed]
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - name: Deploy over SSH (build on server)
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script_stop: true
          script: |
            set -euo pipefail
            cd "${{ secrets.DEPLOY_PATH }}"
            git fetch --all
            git reset --hard origin/main
            set -a; . infra/.env.production; set +a
            docker compose -f infra/docker-compose.prod.yml up -d --build
            docker compose -f infra/docker-compose.prod.yml ps
```

> Required GitHub Secrets (owner sets later, deploy-execution step): `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`. Sourcing `.env.production` makes `NEXT_PUBLIC_*` available for the frontend build args; backend auto-runs migrations on boot (`DB_MIGRATIONS_ENABLED=true`).

- [ ] **Step 3: Lint the workflow (the real test)**

Run:

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/deploy.yml && echo ACTIONLINT_OK
```

Expected: no findings … `ACTIONLINT_OK`. (If actionlint flags the third-party action pin, that is acceptable — fix only real syntax errors.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat(ci): build-on-server deploy workflow after green CI"
```

---

### Task 7: Backup + restore

**Files:**

- Create: `infra/backup.sh`
- Verify: `bash -n` (syntax) + shellcheck via docker

- [ ] **Step 1: Create `infra/backup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# CDOProf nightly backup: PostgreSQL dump (critical) + MinIO volume snapshot.
# Run from the repo root on the server. Add to crontab (daily 03:00):
#   0 3 * * *  cd /path/to/repo && infra/backup.sh >> /var/log/cdoprof-backup.log 2>&1
#
# RESTORE (manual):
#   DB:    gunzip -c BACKUP_DIR/db-STAMP.sql.gz | \
#            docker compose -f infra/docker-compose.prod.yml exec -T postgres \
#            psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#   FILES: docker run --rm -v cdoprof_minio-data:/data -v BACKUP_DIR:/backup alpine \
#            sh -c 'cd /data && tar xzf /backup/minio-STAMP.tar.gz'

COMPOSE_FILE="infra/docker-compose.prod.yml"
BACKUP_DIR="${CDOPROF_BACKUP_DIR:-/var/backups/cdoprof}"
RETENTION_DAYS="${CDOPROF_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Load DB/MinIO credentials.
if [ -f infra/.env.production ]; then
  set -a
  # shellcheck disable=SC1091
  . infra/.env.production
  set +a
fi

mkdir -p "$BACKUP_DIR"

# 1. PostgreSQL dump (gzip).
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-cdoprof}" "${POSTGRES_DB:-cdoprof}" \
  | gzip >"$BACKUP_DIR/db-$STAMP.sql.gz"

# 2. MinIO objects (named-volume snapshot).
docker run --rm \
  -v cdoprof_minio-data:/data:ro \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/minio-$STAMP.tar.gz" -C /data .

# 3. Prune backups older than retention.
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'minio-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[backup] done -> $BACKUP_DIR (db-$STAMP.sql.gz, minio-$STAMP.tar.gz)"
```

- [ ] **Step 2: Syntax + lint (the real test)**

Run:

```bash
bash -n infra/backup.sh && echo SYNTAX_OK
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable /mnt/infra/backup.sh && echo SHELLCHECK_OK
```

Expected: `SYNTAX_OK`; shellcheck prints nothing → `SHELLCHECK_OK` (the `# shellcheck disable=SC1091` covers the sourced env file).

- [ ] **Step 3: Mark executable + commit**

```bash
git add infra/backup.sh
git update-index --chmod=+x infra/backup.sh
git commit -m "feat(infra): nightly backup script + restore runbook"
```

---

### Task 8: Operational runbooks

**Files:**

- Create: `infra/server-setup.md`
- Create: `infra/bootstrap-admin.md`
- Verify: prettier-clean + content review

> These are documentation artifacts (no automated test). They describe the owner-actions of the later deploy-execution step. Keep commands copy-pasteable.

- [ ] **Step 1: Investigate how the first tenant/admin is created (for bootstrap-admin.md)**

Run and read the results:

```bash
grep -rniE 'insert into (core|iam)\.(tenants|users)' apps/backend/migrations | head -40
grep -rniE 'seed|bootstrap|first.?admin|default tenant' apps/backend/migrations apps/backend/src | head -40
```

Use what you find to write the exact prod bootstrap steps (a seed migration that runs automatically, a CLI/script, or a registration endpoint). Do not invent a mechanism — document the one that exists.

- [ ] **Step 2: Create `infra/server-setup.md`**

Content must cover, as numbered shell steps for Ubuntu 22.04+:

1. Install Docker Engine + compose plugin (official convenience script).
2. `ufw` firewall: allow `22/tcp`, `80/tcp`, `443/tcp`; deny incoming default; enable.
3. Create a non-root deploy user, add to `docker` group, install its SSH public key (the private half goes to GitHub Secret `DEPLOY_SSH_KEY`).
4. `git clone` the repo to `DEPLOY_PATH`.
5. `cp infra/.env.production.example infra/.env.production`; generate secrets (`openssl rand -hex 32` for each `CHANGE_ME_GENERATE_HEX`; matching DB/RabbitMQ/MinIO password pairs; `API_KEYS` == `SUPERTOKENS_API_KEY`); set `YOUR_DOMAIN`, `PUBLIC_DOMAIN`, and real `SMTP_*`.
6. Point DNS A-record `YOUR_DOMAIN` → server IP; wait for propagation.
7. First boot: `set -a; . infra/.env.production; set +a; docker compose -f infra/docker-compose.prod.yml up -d --build`.
8. Verify: `docker compose -f infra/docker-compose.prod.yml ps` all healthy; `curl -fsS https://YOUR_DOMAIN/api/v1/health/live`.
9. Add the GitHub Secrets (`DEPLOY_HOST/USER/SSH_KEY/PATH`) so CD works thereafter.
10. Install the backup cron from Task 7.

- [ ] **Step 3: Create `infra/bootstrap-admin.md`**

Document (using the mechanism found in Step 1) how to create the first tenant + first admin user on a fresh prod DB, and how that admin performs the first magic-link login. Include the exact command(s)/SQL/endpoint and how to verify the admin can sign in.

- [ ] **Step 4: Format + verify**

Run:

```bash
pnpm exec prettier --write infra/server-setup.md infra/bootstrap-admin.md
npx --yes markdownlint-cli2 "infra/*.md" || true
```

Expected: prettier rewrites cleanly; review the rendered runbooks for accuracy (every command copy-pasteable, no `YOUR_DOMAIN` left undefined in narrative).

- [ ] **Step 5: Commit**

```bash
git add infra/server-setup.md infra/bootstrap-admin.md
git commit -m "docs(ops): server setup + first-admin bootstrap runbooks"
```

---

## Plan Self-Review

**1. Spec coverage:**

- Spec §1.3 / §4 lists 8 artifacts → Tasks 1 (frontend image), 2 (env template), 4 (prod compose), 5 (Caddyfile), 6 (deploy.yml), 7 (backup.sh), 8 (server-setup.md + bootstrap-admin.md). ✅
- Spec §7/§8 "env validator enforces prod secrets" → Task 3. ✅
- Spec §3 routing (`/`, `/api/v1/*`, `/ws`) → Task 5 Caddyfile matches; `NEXT_PUBLIC_*` bake → Task 1 + Task 2 + Task 4 build args. ✅
- Spec §6 backups + restore → Task 7. ✅
- Spec §9 owner-actions (SSH/DNS/SMTP/pilot) → documented in Task 8 server-setup.md + deploy secrets; not blocking any task. ✅
- Spec §11 deferrals (ANTIVIRUS off, no ЕСИА/НЭП/payments) → Task 2 keeps `ANTIVIRUS_ENABLED=false`, nothing builds those. ✅

**2. Placeholder scan:** `CHANGE_ME_*` / `YOUR_DOMAIN` appear only inside the `.env.production.example` template, where placeholders are the intended content (a `.example` file). All plan _steps_ contain runnable commands and complete file content. No "TBD"/"add error handling"/"similar to Task N". ✅

**3. Type/name consistency:** Service names (postgres/redis/rabbitmq/minio/minio-init/supertokens/backend/realtime/worker/frontend/caddy) match across compose, Caddyfile (`backend:3001`, `realtime:3002`, `frontend:3000`), env hosts, and backup (`cdoprof_minio-data` ← `name: cdoprof`). Env var names match `scripts/check-env.ts` schema. Build args `NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_REALTIME_URL` consistent in Dockerfile (Task 1), compose (Task 4), template (Task 2). ✅

**One open item carried into execution:** Task 8 Step 1 must discover the real first-tenant/admin mechanism before writing `bootstrap-admin.md` — flagged as an investigation step with exact commands, not a guess.
