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
ENV NODE_ENV=production
# NEXT_PUBLIC_* are inlined at build time — they MUST be present now, not at runtime.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_REALTIME_URL
ARG NEXT_PUBLIC_DEFAULT_TENANT_ID
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_DEFAULT_TENANT_ID=$NEXT_PUBLIC_DEFAULT_TENANT_ID
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
USER app
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
