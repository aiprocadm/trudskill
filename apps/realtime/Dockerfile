FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/realtime/package.json apps/realtime/package.json
RUN pnpm install --filter @trudskill/realtime... --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @trudskill/realtime build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/apps/realtime/dist ./apps/realtime/dist
COPY --from=deps /app/node_modules ./node_modules
USER app
EXPOSE 3002
CMD ["node", "apps/realtime/dist/main.js"]
