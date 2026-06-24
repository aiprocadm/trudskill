FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
COPY tooling tooling
RUN pnpm install --filter @trudskill/backend... --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @trudskill/shared-types build \
 && pnpm --filter @trudskill/api-contracts build \
 && pnpm --filter @trudskill/backend build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
# Raw SQL migrations are not part of the compiled dist; the runtime auto-runs them on
# boot (DB_MIGRATIONS_ENABLED). Without this the backend crash-loops on a fresh DB.
COPY --from=build /app/apps/backend/migrations ./apps/backend/migrations
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/package.json ./apps/backend/package.json
USER app
EXPOSE 3001
CMD ["node", "apps/backend/dist/main.js"]
