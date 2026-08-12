FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
# Без манифеста docx-render шаг install не видит пакет, на который бэкенд ссылается
# как workspace:*, и `--filter @trudskill/backend...` не подтягивает его зависимости.
COPY packages/docx-render/package.json packages/docx-render/package.json
COPY tooling tooling
RUN pnpm install --filter @trudskill/backend... --frozen-lockfile

FROM deps AS build
COPY . .
# docx-render добавлен в Фазе 1 «Документы» и импортируется бэкендом (шаблоны, личное дело,
# счета аренды), но в эту цепочку его тогда не вписали — образ не собирался вовсе
# (TS6305: dist/index.d.ts has not been built). Не замечали, потому что джоба smoke-теста
# запускается последней и раньше не доходила до старта из-за красных предыдущих.
RUN pnpm --filter @trudskill/shared-types build \
 && pnpm --filter @trudskill/api-contracts build \
 && pnpm --filter @trudskill/docx-render build \
 && pnpm --filter @trudskill/backend build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
# Raw SQL migrations are not part of the compiled dist; the runtime auto-runs them on
# boot (DB_MIGRATIONS_ENABLED). Without this the backend crash-loops on a fresh DB.
COPY --from=build /app/apps/backend/migrations ./apps/backend/migrations
COPY --from=deps /app/node_modules ./node_modules
# pnpm раскладывает зависимости по рабочим пространствам: в корне лежит только хранилище
# .pnpm и корневые dev-пакеты, а reflect-metadata и @nestjs/* — в apps/backend/node_modules
# (симлинки в это хранилище). Без этой строки образ собирается, но падает на старте
# «Cannot find package 'reflect-metadata'». Раньше не всплывало: джоба smoke-теста не
# доходила до запуска, потому что сборка образа падала раньше.
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/apps/backend/package.json ./apps/backend/package.json
# Пакеты монорепо подключены как workspace:* — в образ нужны и их симлинки, и собранный dist.
# У shared-types своих зависимостей нет, поэтому и папки node_modules у него не существует.
COPY --from=deps /app/packages/api-contracts/node_modules ./packages/api-contracts/node_modules
COPY --from=deps /app/packages/docx-render/node_modules ./packages/docx-render/node_modules
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /app/packages/api-contracts/dist ./packages/api-contracts/dist
COPY --from=build /app/packages/api-contracts/package.json ./packages/api-contracts/package.json
COPY --from=build /app/packages/docx-render/dist ./packages/docx-render/dist
COPY --from=build /app/packages/docx-render/package.json ./packages/docx-render/package.json
USER app
EXPOSE 3001
CMD ["node", "apps/backend/dist/main.js"]
