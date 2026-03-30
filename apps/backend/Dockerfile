FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/package.json
COPY tooling tooling
RUN pnpm install --filter @cdoprof/backend... --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @cdoprof/backend build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/package.json ./apps/backend/package.json
USER app
EXPOSE 3001
CMD ["node", "apps/backend/dist/main.js"]
