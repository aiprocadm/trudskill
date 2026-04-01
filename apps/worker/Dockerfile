FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --filter @cdoprof/worker... --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @cdoprof/worker build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=deps /app/node_modules ./node_modules
USER app
CMD ["node", "apps/worker/dist/main.js"]
