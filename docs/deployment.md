# Deployment

## Docker images
- `apps/backend/Dockerfile`
- `apps/worker/Dockerfile`
- `apps/realtime/Dockerfile`

All images are multi-stage and run as non-root user.

## Prod-like launch
`docker compose -f infra/docker-compose.yml up -d --build`

## Startup ordering
Compose `depends_on` + healthchecks are used; no sleep hacks.
